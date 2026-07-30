// server.js
// 这是一个简单的Node.js后端，作用是：
// 1. 接收前端传来的用户勾选标签（心情/场景/语种）
// 2. 拼接成搜索关键词
// 3. 转发请求给你自己部署的网易云音乐API服务（NeteaseCloudMusicApi）
// 4. 把结果整理好返回给前端
//
// 为什么需要这一层？因为前端直接调用音乐API会遇到"跨域"限制，
// 加一层自己的后端做"中转站"就能绕开这个问题。

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public'))); // 提供前端静态文件

// 【重要】这里填你自己部署的网易云音乐API地址
// 需要先按照 https://github.com/Binaryify/NeteaseCloudMusicApi 的说明
// 把这个开源项目部署到 Render / Railway 等平台（跟你部署ieltswords.top的流程类似）
// 部署好之后，把得到的地址填在这里，比如 https://my-netease-api.onrender.com
const NETEASE_API_BASE = process.env.NETEASE_API_BASE || 'http://localhost:3000';

// 根据用户勾选的标签，搜索并返回一首推荐歌曲
app.get('/api/recommend', async (req, res) => {
  const { mood, scene, lang } = req.query;

  if (!mood && !scene && !lang) {
    return res.status(400).json({ error: '请至少选择一个偏好标签' });
  }

  // 把标签拼接成搜索关键词，比如"元气 运动 英文"
  const keywords = [mood, scene, lang].filter(Boolean).join(' ');

  try {
    // 第一步：用关键词搜索歌曲列表
    const searchResp = await axios.get(`${NETEASE_API_BASE}/search`, {
      params: { keywords, limit: 20, type: 1 },
      timeout: 8000,
    });

    const songs = searchResp.data?.result?.songs;
    if (!songs || songs.length === 0) {
      return res.status(404).json({ error: '没搜到匹配的歌曲，换个标签试试' });
    }

    // 从搜索结果里随机挑一首（避免每次都是同一首）
    const randomIndex = Math.floor(Math.random() * Math.min(songs.length, 10));
    const picked = songs[randomIndex];

    // 第二步：获取这首歌的详情（拿封面图）
    let picUrl = '';
    try {
      const detailResp = await axios.get(`${NETEASE_API_BASE}/song/detail`, {
        params: { ids: picked.id },
        timeout: 8000,
      });
      picUrl = detailResp.data?.songs?.[0]?.al?.picUrl || '';
    } catch (e) {
      console.warn('获取封面失败，忽略', e.message);
    }

    res.json({
      id: picked.id,
      name: picked.name,
      artist: picked.artists?.map(a => a.name).join('/') || '未知歌手',
      album: picked.album?.name || '',
      picUrl,
      candidateCount: songs.length,
    });
  } catch (err) {
    console.error('调用音乐API失败:', err.message);
    res.status(500).json({
      error: '音乐服务暂时不可用，请稍后再试',
      detail: '第三方API可能不稳定，建议检查NETEASE_API_BASE是否配置正确',
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`服务已启动，监听端口 ${PORT}`);
});
