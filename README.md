# 勾选偏好推荐歌曲网站

## 项目结构
```
song-recommend/
├── server.js          # 后端服务（转发请求，解决跨域）
├── package.json       # 依赖配置
└── public/
    └── index.html     # 前端页面（勾选标签+展示结果）
```

## 部署步骤（分3步，每步做完可以确认一下再继续）

### 第一步：部署网易云音乐API服务
这是必须先做的一步，因为你自己的后端需要调用它。

1. 打开 https://github.com/Binaryify/NeteaseCloudMusicApi
2. 按照它的 README 说明，把这个项目部署到 Render（跟你部署 ieltswords.top 的流程一样：GitHub 仓库 → Render 新建 Web Service → 选这个仓库 → 部署）
3. 部署成功后，Render 会给你一个地址，类似 `https://xxx.onrender.com`
4. 记下这个地址，第二步要用

### 第二步：部署你自己的推荐网站后端
1. 把 `song-recommend` 这个文件夹上传到一个新的 GitHub 仓库
2. 在 Render 新建另一个 Web Service，连接这个仓库
3. 在 Render 的环境变量里加一条：
   - Key: `NETEASE_API_BASE`
   - Value: 第一步拿到的地址（比如 `https://xxx.onrender.com`）
4. Build Command 填 `npm install`，Start Command 填 `npm start`
5. 部署完成后，Render 会给你一个新地址，这就是你网站的最终地址

### 第三步：本地测试（可选，正式部署前先在自己电脑跑一下）
```bash
cd song-recommend
npm install
NETEASE_API_BASE=你的音乐API地址 npm start
```
然后浏览器打开 `http://localhost:8080` 就能看到页面。

## 注意事项
- 音乐API是第三方逆向接口，个别歌曲可能因版权被下架或无法获取封面，代码里已经加了容错处理（拿不到封面就留空，不会白屏）
- 如果搜索结果为空，说明关键词组合太生僻，可以把标签选项适当调整得更常见一些
