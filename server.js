// server.js
// 核心逻辑升级说明：
// 之前的版本把"放松 运动 英文"这种标签词直接当"歌曲搜索词"去搜，
// 但网易云的歌曲搜索匹配的是"歌名/歌手名"，不是心情场景这类抽象词，所以搜不到结果。
//
// 现在改成：利用网易云音乐本身就有的"歌单分类"体系（比如"运动"、"放松"、"伤感"
// 这些本来就是官方歌单分类标签），把用户勾选的标签映射到这些真实分类，
// 然后：找到该分类下的热门歌单 → 随机选一个歌单 → 从歌单里随机抽一首歌
// → 再获取这首歌的播放链接，前端就能真正听了。

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// 【重要】你自己部署的网易云音乐API地址
const NETEASE_API_BASE = process.env.NETEASE_API_BASE || 'http://localhost:3000';

// 把咱们UI上的标签，映射到网易云官方歌单分类里真实存在的名字
// （这些分类名是网易云"发现音乐-歌单广场"里本来就有的，映射越准，匹配效果越好）
const TAG_TO_CATEGORY = {
  // 心情
  emo: '伤感',
  '元气': '快乐',
  '放松': '放松',
  '燃': '兴奋',
  // 场景
  '通勤': 'driving',
  '运动': '运动',
  '睡前': '夜晚',
  '学习': '学习',
  // 语种（网易云分类里没有直接的"语种"概念，这里退而求其次映射到风格相关分类）
  '华语': '华语',
  '英文': '欧美',
  '日语': '日语',
  '纯音乐': '轻音乐',
};

// 按优先级挑一个标签来决定分类：心情 > 场景 > 语种
// （网易云的歌单分类接口一次只能传一个分类，所以只能选其中一个做主导）
function pickCategory({ mood, scene, lang }) {
  if (mood && TAG_TO_CATEGORY[mood]) return TAG_TO_CATEGORY[mood];
  if (scene && TAG_TO_CATEGORY[scene]) return TAG_TO_CATEGORY[scene];
  if (lang && TAG_TO_CATEGORY[lang]) return TAG_TO_CATEGORY[lang];
  return '推荐'; // 兜底分类
}

app.get('/api/recommend', async (req, res) => {
  const { mood, scene, lang } = req.query;

  if (!mood && !scene && !lang) {
    return res.status(400).json({ error: '请至少选择一个偏好标签' });
  }

  const category = pickCategory({ mood, scene, lang });

  try {
    // 第一步：按分类找热门歌单
    const playlistResp = await axios.get(`${NETEASE_API_BASE}/top/playlist`, {
      params: { cat: category, limit: 20 },
      timeout: 8000,
    });

    const playlists = playlistResp.data?.playlists;
    if (!playlists || playlists.length === 0) {
      return res.status(404).json({ error: `"${category}"分类下暂时没有歌单，换个标签试试` });
    }

    // 随机选一个歌单
    const playlist = playlists[Math.floor(Math.random() * playlists.length)];

    // 第二步：拿这个歌单里的歌曲列表
    const trackResp = await axios.get(`${NETEASE_API_BASE}/playlist/track/all`, {
      params: { id: playlist.id, limit: 50 },
      timeout: 8000,
    });

    const tracks = trackResp.data?.songs;
    if (!tracks || tracks.length === 0) {
      return res.status(404).json({ error: '这个歌单是空的，再试一次吧' });
    }

    // 随机选一首歌
    const track = tracks[Math.floor(Math.random() * tracks.length)];

    // 第三步：获取播放链接（免费歌曲通常能拿到，付费/下架歌曲可能拿不到）
    let playUrl = '';
    try {
      const urlResp = await axios.get(`${NETEASE_API_BASE}/song/url/v1`, {
        params: { id: track.id, level: 'standard' },
        timeout: 8000,
      });
      playUrl = urlResp.data?.data?.[0]?.url || '';
    } catch (e) {
      console.warn('获取播放链接失败', e.message);
    }

    // 把真实的网易云CDN地址包装成"经过我们自己后端转发"的地址
    // 前端请求这个地址时，实际会打到 /api/stream，由后端代为请求网易云再转发回来
    const proxiedPlayUrl = playUrl
      ? `/api/stream?url=${encodeURIComponent(playUrl)}`
      : '';

    res.json({
      id: track.id,
      name: track.name,
      artist: track.ar?.map(a => a.name).join('/') || '未知歌手',
      album: track.al?.name || '',
      picUrl: track.al?.picUrl || '',
      playUrl: proxiedPlayUrl, // 为空表示这首歌暂时无法在线播放（版权限制），前端要处理这种情况
      fromPlaylist: playlist.name,
      category,
    });
  } catch (err) {
    console.error('调用音乐API失败:', err.message);
    res.status(500).json({
      error: '音乐服务暂时不可用，请稍后再试',
      detail: '第三方API可能不稳定，或该分类接口暂不可用',
    });
  }
});

// 音频代理接口：浏览器不直接连网易云CDN（会被Referer检查拦截），
// 而是让我们自己的后端先去请求音频数据，再转发给浏览器
app.get('/api/stream', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: '缺少播放链接' });
  }

  try {
    const audioResp = await axios.get(url, {
      responseType: 'stream',
      timeout: 15000,
      headers: {
        // 伪装成从网易云自己的页面发起请求，这样对方CDN才会正常返回音频
        'Referer': 'https://music.163.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    res.setHeader('Content-Type', audioResp.headers['content-type'] || 'audio/mpeg');
    audioResp.data.pipe(res);
  } catch (err) {
    console.error('音频转发失败:', err.message);
    res.status(500).json({ error: '音频加载失败' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`服务已启动，监听端口 ${PORT}`);
});
