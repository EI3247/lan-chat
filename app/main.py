import os
import re
import json
import uuid
import random
import time
import hmac
import html
import shutil
import sqlite3
import hashlib
import mimetypes
import subprocess
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Any

from fastapi import FastAPI, Request, Response, UploadFile, File, Form, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, RedirectResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import URLSafeSerializer, BadSignature
try:
    from PIL import Image
except Exception:
    Image = None
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:
    pass

DATA_DIR = Path(os.getenv('LANCHAT_DATA_DIR', '/data'))
UPLOADS_DIR = DATA_DIR / 'uploads'
AVATARS_DIR = DATA_DIR / 'avatars'
PREVIEWS_DIR = DATA_DIR / 'previews'
TMP_UPLOADS_DIR = DATA_DIR / 'tmp_uploads'
QUICK_DROP_DIR = DATA_DIR / 'quick_drop'
DB_PATH = DATA_DIR / 'chat.db'
SITE_TITLE = os.getenv('LANCHAT_SITE_TITLE', 'LAN Chat')
WELCOME = os.getenv('LANCHAT_WELCOME', '局域网聊天室')
FILES_TITLE = os.getenv('LANCHAT_FILES_TITLE', '文件目录')
APP_VERSION = "1787215979"
APP_UPDATED_AT = "1787215979"
APP_CHANGELOG = [
    '修复竖屏视频在网盘页和个人资料页显示不全：网盘页视频缩略图改用 cover 填满预览区，资料页媒体容器改为高度自适应，竖屏视频不再被压成细条。',
    'P2P 文件直传（WebRTC）：点别人头像可发起直传，对方在线时弹窗确认后通过 WebRTC DataChannel 直接传输文件，不经服务器存储。含在线检测、进度条、流控。最大 5GB。',
    '个人名片页新增撤回按钮：查看自己的消息时可直接在名片页撤回，不必回到聊天流操作。',
    '视频预览图改为纯后端 ffmpeg 生成：彻底移除前端 canvas 抓帧 poster（抓首帧在抖音短视频/飞书 WebView 下常得黑帧，且无条件覆盖后端好图）。上传后后端用亮度检测多时间点截帧择优，不再黑屏。小屏幕局域网 NAS 本地 ffmpeg 截帧亚秒级，延迟无感。',
    '看图切图恢复为拖拽位移特效（滑出+滑入）。',
    '昵称查重改回点保存时检查（取消实时查重）。',
    '修复资料页黄色感叹号图标常驻：.field-error[hidden] 被 display:flex 覆盖，加 !important 修正，现在只有出错才显示。', 
    '看图模式新增画廊切图：未放大状态下水平/垂直长滑动（>80px 且方向明确）切上/下一张，带滑动动画+计数+左右箭头按钮；范围为当前视图所有图片（含 GIF/实况，排除视频）；与双击放大/拖拽/双指缩放/单击关闭互不冲突（聊天/网盘/后台三处）。',
    '昵称重名错误改为显示在资料页昵称输入框旁边（不再被弹窗挡住）。', 
    '昵称强制唯一：去首尾空格+不区分大小写判重；创建/改名/后台改名重名报 409“昵称已被占用”；自动随机名也去重。存量重名迁移：每组保留最早一个，其余加 2 位随机后缀。', 
    '一键到底按钮：翻历史时来新消息，按钮上显示 +N 累加计数（渐变胶囊 + 跳动动画），每来一条 +1 并重新浮现（停 2 秒淡出）；滑到底/点击清零。',
    '修复通用问题：移动端点击按钮出现的方形高亮阴影（全局 button 加 -webkit-tap-highlight-color:transparent + appearance:none）。', 
    '一键到底按钮改为方向感应：手指从下往上滑（朝最新/底部）才渐变浮现，往下滑看历史不出现；不常驻，停止 2 秒自动淡出；点击为模拟人手快速滑到底的缓动动画（非瞬间跳到）。', 
    '聊天页/文件页新增“一键到底”浮动按钮：半透明紫蓝渐变圆钞，上滑离底时浮现、到底自动隐藏；聊天页有新消息且未在底部时显示红点提示，点击平滑回到最新/底部。', 
    '视频预览图优化：只在前几秒密集抽帧（不取中间帧，避免点播放画面突兑），用 ffmpeg signalstats 亮度检测跳过黑场/纯色空白帧（实况照/iPhone Live Photo 开场常黑），选第一个足够亮的早帧。', 
    '日期分割线添加午夜自动刷新：跨过 0 点自动重算标签（“今天”变“昨天”），不靠新消息触发；后台回前台 resume 时重算下个午夜防节流漏触。', 
    '聊天气泡新增渐变日期分割线：跨天自动插入“今天/昨天/前天/X月X日 星期X”胶囊分隔（两侧渐变细线）；加载/上翻/新消息/搜索跳转后均重建分割线。', 
    '网盘页标题可在后台配置（新增“网盘页标题”设置项，默认“文件目录”，同时控制页面 H1 和浏览器标签，服务端渲染不闪）。删除标题下方的“欢迎语”副标题（登录页/聊天页/后台配置项均移除）。', 
    '修复：刷新时标题瞬间闪“LAN Chat”。原因是 HTML 写死默认标题，等 JS 拉到 /api/config 才替换。现改为服务端渲染时直接把真实站点标题注入 <title>，首帧即正确，不再闪。', 
    '时间日历：未来日期置灰不可选（还没到的日子没消息），且不能翻到未来月份（当月后“下一月”按钮禁用）。', 
    '修复：时间日历点某天后自动收回。原因是 renderCal 重建格子后被点的按钮从 DOM 被摘掉，事件冒泡到“点外部关闭”被误判。现日历内部点击均 stopPropagation，选起止不再自动收起，只有点日历外或确定才关。',
    '修复：时间选择日历浮层被搜索弹窗（top-layer）遮住、夹在中间的问题 — 将日历浮层移进搜索弹窗内部，现在正常盖在最上层。',
    '消息分页加载：初始 120 条，向上滑到顶部自动加载更早 30 条/次（保持滚动位置不跳）。搜索点结果如果不在已加载范围，自动以该消息为中心加载上下文再定位。',
    '搜索弹窗新增「📅 按时间」页：自定义范围日历（一个日历选起止、中间高亮）+今天/昨天/近7天/近30天快捷，列出该时段消息，点某条跳回主聊天流定位。',
    '搜索定位增强：点搜索结果除了整条气泡黄色高亮，还会在长文里高亮匹配的关键词并滚到第一个匹配词居中（折叠长文自动展开）；用 TreeWalker 安全染色不破坏 markdown/链接。',
    '看图模式（聊天气泡/网盘/后台三处）新增单击返回：未放大状态下轻点图片即关闭，与双击放大/拖拽平移/双指缩放互不冲突（判定无位移且<300ms的干净点击，延迟 280ms 避让双击；放大后单击不关闭）。',
    'IP 显示改回原样（不再显示内网/外网文字）；保留 host 网络模式，内网直连用户显示真实 192.168.x，frp 外网用户显示 127.0.0.1。',
    '容器改 host 网络模式拿真实来源 IP（去掉 Docker NAT 的 172.30.x）；IP 展示区分内外网：局域网私有段显“内网”、frp 隧道过来的回环地址显“外网”、公网 IP 原样显示（以后可接地理库显示省市）。',
    '修复后台回来发文字消息要等 2 秒才出气泡：① 文字消息改为乐观渲染（点发送瞬间先出气泡，服务器返回再对账；失败标红+回填输入框），绕开 Chrome 后台 socket 假死的延迟；② 去掉过于激进的 window focus 重拉、resync 加防抖。',
    '修复谷歌浏览器滑到底还能往上拉、下方露出空白（橡皮筋回弹）：聊天页锁死文档级滚动（body fixed + overflow hidden），只让消息区内部滚动并 overscroll-behavior:contain。',
    '修复两个 Chrome 问题：① 输入框与键盘之间出现大片空白（viewport 加 interactive-widget=resizes-content，键盘弹出时压缩页面）；② 切后台再回来消息不刷新（WebSocket 重连加固：visibilitychange/focus/online 时检测连接、重连并补拉期间错过的消息，不需手动刷新）。',
    '上传支持多选：📎 可一次选多个文件（可多次追加/逐个移除），每个文件生成一条消息，串行排队逐个上传（进度显示 N/总数）；文字只跟第一个文件；某个失败自动跳过继续下一个，结束后给出失败清单+「重试失败项」按钮。',
    '气泡菜单滚入视区时底部留 18px 间隙（scroll-margin-bottom），气泡底不再贴边被遮。',
    '气泡菜单体验修正：点⋯时锁住气泡当前宽度（窄气泡不再被擑宽，菜单在原宽度内换行）；最后一条消息展开菜单后自动滚入可视（scrollIntoView）；关闭时还原宽度。',
    '气泡菜单修正：文件/图片/视频的 下载/大图/编辑 也收进「⋯」；菜单改为气泡内同宽度行内展开（不再浮层裁剪），点⋯在气泡下方无缝推出按钮。',
    '聊天气泡按钮精简：默认只留「复制」+「展开」（展开仍按需出现），编辑/设为私人公开/撤回 全部收进「⋯」更多菜单（点开才展开，点外部/编辑自动收起）。',
    '身份码方案定稿：默认随机身份码改为纯 6 位（无前缀）；密码可选（身份码本身即凭证，空密码凭码即可恢复）；「恢复/绑定旧身份」改为合并（当前设备消息/文件挂到目标身份、删当前临时身份、切 cookie，无护栏）；恢复接口同 IP 每分钟≤5 次限流；后台用户行显示身份码+密码状态，并加「重置密码」（不看明文，重置为无密码态）。',
    '新增身份码与恢复（设置页）：每个身份默认随机身份码，可改成自定义（支持中文）。首次设密码后，换设备/清缓存可用「身份码+密码」恢复同一身份（多设备共用，私人消息/网盘不丢）。修改身份码/密码需验证原密码；进入聊天室仍只需访问密码（“简单进入”不变）。',
    '修复资料弹窗不能滚动/内容溢出：旧的媒体查询 #profileDialog .dialog-card 规则 ID 优先级过高，强制卡片 grid+自身滚动压过了新的 flex 布局。已用 :not(.profile-card) 排除并提高新规则优先级；现在中间内容独立滚动、底部按钮固定不露馅。',
    '资料弹窗改为 flex 三段式：中间内容独立滚动，底部「关闭/保存」固定在滚动区之外（不再用 sticky）。',
    '私人模式体验修正：去掉聊天页右上角悬浮的模式切换按钮（「我的设置」为唯一切换入口）；修复资料弹窗头像/昵称错误悬浮（profile-preview 误用 sticky）；资料页昵称后显示自己的 IP（仅本人可见）；右上搜索按钮左移避开右侧消息头像。',
    '新增私人模式：设置里可切「群聊模式/私人模式」。私人模式下发的消息/文件仅自己可见（聊天页只看自己的私人消息、网盘页只看自己的私人文件），群聊模式只看公共内容；切换不影响已发消息归属。单条消息可改模式（设私人/公开，公开需二次确认）。私人消息走 WS 定向推送，别人/未登录连接收不到；公开直链对非本人 404。后台可见全部并标识🔒私人/群聊。',
    '头像裁切新增缩放读数：实时显示缩放百分比 + 清晰度提示（清晰/偏虚 + 对应源图像素），放太大会提示偏虚建议缩小',
    '头像优化：裁切框去掉多余白圈（单圈）；裁切后不立即生效改为点保存才上传；设置页头像可点看大图；资料页/设置页头像大图按圆形展示（消除方形白边）',
    '上传头像新增圆形裁切：选图后弹出裁切框（拖动定位+滑块缩放+圆形遮罩预览），确认后导出 256px 圆形 PNG 再上传',
    '修复用户资料弹窗单条消息时聊天记录区错位（grid 行数 4→5，1fr 正确落在消息区，消息顶部对齐）',
    '恢复消息时连带恢复其引用的软删除文件（单条 PATCH 与批量 restore 都生效），让批量删除可完整撤销',
    '安全加固：文件批量删除改为仅软删除（不物理删文件，可后台恢复），全选删除需输入文字二次确认；修复误删事故',
    '后台文件区：修复改类型/删除按钮（改容器级事件绑定）、改类型下拉默认选中当前类型、新增多选+全选+批量删除（POST /api/admin/files/batch-delete）',
    '美化超级后台 UI：头部改为渐变横幅+玻璃 logo，顶部按钮玻璃胶囊，折叠面板标题/徽章、主按钮更立体（仅 admin-page 作用域）',
    '清理所有 .bak 备份文件，重写精简 AI_CONTEXT.md（合并碎片化约定、修正过时内容）',
    '修复后台撤回文件无法打开/下载/预览：后台改用 require_admin 专用文件入口 /api/admin/file/{id}/raw|download|preview，不受撤回过滤',
    '管理后台用户区新增搜索：按昵称或 IP 实时过滤',
    '聊天框输入后台暗号（默认1027，可后台配置）直接进管理后台；暗号只存后端不下发前端；后台配置区自动回填标题/欢迎语/暗号',
    '修复搜索入口不显示：本布局顶栏隐藏，改为右上角 fixed 悬浮半透明胶囊（🔍 搜索），全设备可见',
    '搜索入口改为右上角半透明胶囊（🔍 搜索），移除底部多余搜索按钮，避免操作栏挤成两行',
    '新增聊天室搜索：顶栏放大镜入口，弹窗内同时搜索聊天消息和文件名，命中可定位/打开详情',
    '用户资料页每条消息下方的操作按钮改为右对齐',
    '撤回文件消息后公开直链/外链也失效（恢复后重新生效）；资料页改为显示撤回消息，本人资料页可一键恢复',
    '普通用户撤回文件消息后从网盘和资料页下载隐藏，自己撤回的消息可恢复，后台仍可管理文件',
    '用户资料页：聊天记录文件名可点开文件详情，移除冗长 ID 字段，上传头像可点开看大图',
    '压缩用户资料弹窗信息区：保留全部信息但减少框线和高度，把空间还给聊天记录',
    '优化用户头像资料卡片：聊天记录区占满主体空间，并修复资料页内图片预览被 dialog 盖住的问题',
    '修复聊天室文件详情图标显示为 Promise/英文字母的问题，移除残留 async',
    '优化文件详情弹窗 UI：改为信息卡布局，删除复制外链按钮，保持文本可复制并锁住底层滚动',
    '修复小尺寸视频播放后气泡回缩：按视频原始宽度保持 fallback 宽度，不因播放/元数据加载移除兜底类',
    '优化视频预览图质量：旧小体积/疑似空白 poster 会强制重生成，ffmpeg 多时间点截帧择优',
    '集成 ffmpeg 到容器：上传视频时后端自动兜底截取预览图，并支持历史视频批量补图',
    '修复文本/JS 文件查看编辑框横向滑动：长代码行保持不换行，可左右滚动查看完整内容',
    '新增 /i 项目信息页，显示版本、运行路径、容器和 AI 修改入口说明',
    '聊天消息支持三反引号代码块，代码框右上角可单独复制代码',
    '气泡复制按钮复制整条消息原文，包含文字和代码块',
    '优化资料弹窗桌面/移动端滚动与背景板显示',
    '重写资料弹窗最终尺寸规则：PC 不再变窄裁剪，移动端不再向右溢出',
    '将 /favicon.ico 改为真正的 ICO 文件，兼容不支持 SVG favicon 的浏览器',
    '取消 3 秒全量刷新，避免视频播放被重绘打断',
    '上传视频时前端生成首帧预览图并作为 poster 展示',
    '文件上传改为带进度条和实时速度显示',
    '选择文件后增加取消按钮，上传前生成视频预览阶段也立即显示进度状态',
    '新增分片上传：页面内支持停止、继续、取消，取消会删除服务端临时分片',
    '文本文件默认查看模式，支持编辑/取消/保存确认，并修复移动端底层滚动',
    '同步聊天页、网盘页、管理后台的文本文件查看/编辑交互，编辑状态标题变红',
    '网盘页改为底部悬浮操作栏，增加文本类型筛选，并压缩网盘/管理后台文件预览密度',
    '新增免登录文件外链查看页 /file/{id}，下载和打开分离，视频预览点开正常播放器',
    '新增 /原文件名.ext 形式免登录直链外链，供其他网页直接引用，下载和直链继续分离',
    '管理后台同步网盘预览交互：图片可放大缩放，视频点开正常播放器，用户区改为折叠面板',
    '管理后台文件区改为默认折叠并移动到消息上方，消息区改为默认展开折叠面板',
    '随机昵称改为简约诗意名称且不再添加数字后缀，旧自动昵称批量替换',
    '补充清理旧随机昵称池里的无后缀名称，如局域网用户/路过网友/临时工等',
    '轻量美化聊天室气泡下方操作按钮，字体更小、胶囊化、保留移动端点击面积',
    '聊天室气泡按钮文案精简为两字内，展开/收起动态切换，优化用户名和时间戳样式',
    '修复聊天媒体文件名展示、移动端长文件名溢出、刷新后底部滚动、文本编辑页跳动、按钮垂直居中和网盘无预览卡片拉伸',
    '修复发送按钮旁“文本”扩展编辑器打开/同步时自动聚焦导致的移动端上下跳动',
    '修复选择上传长文件名撑宽聊天室，以及媒体气泡被文件名撑大产生大黑边的问题',
    '将聊天图片/视频文件名底部悬层调整为更轻的半透明样式',
    '将聊天图片/视频文件名改为上下拼接半透明底栏，宽度跟随媒体本身避免挡住视频播放',
    '修复媒体文件名底栏圆角，并在聊天室/网盘/后台支持点击文件名查看文件详情',
    '普通/文本等非媒体文件名改为完整换行显示，仅图片/视频/音频文件名保留省略；强化气泡内文件名点击详情',
    '文件详情上传者统一显示用户昵称，修复文本/JS 查看编辑页滚动时文字越界和页面跟随上下动',
    '重新实现移动端弹窗滚动锁定和文本/JS 编辑区边界滚动处理，避免上下滑动带动页面或文字溢出背景',
    '修复刷新后用户立即上滑仍被延迟自动滚到底的问题，用户滚动会取消本轮自动贴底',
    '修复管理后台长文件名撑宽文件卡片导致按钮超出屏幕，后台文件名和操作区现在会在卡片内换行',
    '为管理后台补上 admin-page 宽度约束并新增 /i 版本入口，进一步防止长文件名撑出屏幕',
    '强化后台消息附件和文件列表长文件名换行，解决文件名仍超出屏幕和卡片 UI 的问题',
    '修复聊天室音频气泡文件名栏又窄又高且未与播放器无缝拼接的问题',
    '补强聊天图片/视频媒体加载失败或极小尺寸时的最小宽度，避免文件名栏塌成窄竖条',
    '修复媒体宽度同步把旧小图锁成过窄宽度的问题，小于阈值时回退 CSS 最小宽度',
    '媒体宽度同步在小图/坏图场景显式写入 220px 兜底宽度，防止 inline auto 未覆盖旧窄宽',
    '为小图/坏图媒体卡片增加 fallback class，强制媒体和文件名栏同宽展示',
    '修正 fallback 媒体卡片 inline width 写法，确保实际卡片宽度不被小媒体测量值覆盖',
]
SECRET_KEY = os.getenv('LANCHAT_SECRET_KEY', 'lan-chat-dev-secret')
ACCESS_PASSWORD = os.getenv('LANCHAT_ACCESS_PASSWORD', 'lan1111')
ADMIN_PASSWORD = os.getenv('LANCHAT_ADMIN_PASSWORD', 'admin')
ADMIN_MAGIC_CODE = os.getenv('LANCHAT_ADMIN_MAGIC_CODE', '1027')

for d in [DATA_DIR, UPLOADS_DIR, AVATARS_DIR, PREVIEWS_DIR, TMP_UPLOADS_DIR, QUICK_DROP_DIR]:
    d.mkdir(parents=True, exist_ok=True)

app = FastAPI(title='LAN Chat')

@app.middleware('http')
async def no_cache_middleware(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path in ['/', '/files', '/admin', '/favicon.ico'] or path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response
app.mount('/static', StaticFiles(directory=Path(__file__).parent / 'static'), name='static')

@app.get('/favicon.ico')
def favicon():
    ico = Path(__file__).parent / 'static' / 'favicon.ico'
    if ico.exists():
        return FileResponse(ico, media_type='image/x-icon')
    svg = Path(__file__).parent / 'static' / 'favicon.svg'
    return FileResponse(svg, media_type='image/svg+xml')
serializer = URLSafeSerializer(SECRET_KEY, salt='lan-chat')

PRESET_AVATARS = ['🦊','🐼','🐯','🐸','🐵','🐧','🐳','🦄','🐱','🐶','🐰','🐨','🦁','🐙','🦉','🦋','🌵','🍄','🚀','⭐']
POETIC_NICKNAMES = ['听雨','见山','知夏','晚星','云舟','月白','青岚','南枝','风眠','星河','清欢','鹿鸣','竹影','初雪','松间','溪亭','云深','棠梨','白露','晴川','疏桐','望舒','扶光','长风','明澈','予安','若水','青禾','沐辰','栖迟','有晴','拾光','知微','云起','听澜','映雪','南星','北辰','秋池','春酲','温言','寄月','临溪','山月','林晚','澄川','微澜','星眠','云朵','清野']
OLD_NICK_PREFIXES = ['访客','小海豹','局域网用户','路过网友','代码侠','文件搬运工','摸鱼人','快乐网友','临时工','游客']
IMG_EXTS = {'.jpg','.jpeg','.png','.gif','.webp','.avif','.bmp','.svg','.heic','.heif'}
VIDEO_EXTS = {'.mp4','.webm','.mov','.m4v','.avi','.mkv'}
AUDIO_EXTS = {'.mp3','.wav','.ogg','.m4a','.flac','.aac'}
TEXT_EXTS = {'.txt','.md','.markdown','.log','.json','.jsonl','.xml','.yaml','.yml','.csv','.tsv','.ini','.conf','.cfg','.properties','.env','.py','.js','.ts','.jsx','.tsx','.html','.htm','.css','.scss','.less','.sh','.bash','.zsh','.bat','.ps1','.java','.c','.cpp','.cc','.h','.hpp','.go','.rs','.php','.rb','.pl','.lua','.sql','.dockerfile','.gitignore'}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    con = db()
    con.executescript('''
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      avatar_type TEXT NOT NULL DEFAULT 'preset',
      avatar_value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT,
      last_ip TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      msg_type TEXT NOT NULL DEFAULT 'text',
      file_id TEXT,
      withdrawn INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0,
      edited INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      public_name TEXT,
      path TEXT NOT NULL,
      preview_path TEXT,
      mime TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'file',
      created_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    ''')
    cols = [r['name'] for r in con.execute('PRAGMA table_info(files)').fetchall()]
    if 'public_name' not in cols:
        con.execute('ALTER TABLE files ADD COLUMN public_name TEXT')
    con.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_files_public_name_active ON files(public_name) WHERE deleted=0 AND public_name IS NOT NULL')
    # 私人模式：messages.private（0=群聊 1=仅本人可见）。老数据默认 0=群聊。
    mcols = [r['name'] for r in con.execute('PRAGMA table_info(messages)').fetchall()]
    if 'private' not in mcols:
        con.execute('ALTER TABLE messages ADD COLUMN private INTEGER NOT NULL DEFAULT 0')
    # 身份码恢复：users.id_code（恢复码/身份标识，可中文，唯一） + secret_hash（个人密码哈希）。
    ucols = [r['name'] for r in con.execute('PRAGMA table_info(users)').fetchall()]
    if 'id_code' not in ucols:
        con.execute('ALTER TABLE users ADD COLUMN id_code TEXT')
    if 'secret_hash' not in ucols:
        con.execute('ALTER TABLE users ADD COLUMN secret_hash TEXT')
    con.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id_code ON users(id_code) WHERE id_code IS NOT NULL')
    # 给老用户回填随机身份码（密码保持为空，首次设置时再设）。
    for r in con.execute("SELECT id FROM users WHERE id_code IS NULL OR id_code=''").fetchall():
        con.execute('UPDATE users SET id_code=? WHERE id=?', (gen_id_code(con), r['id']))
    defaults = {
        'access_password_hash': hash_password(ACCESS_PASSWORD),
        'admin_password_hash': hash_password(ADMIN_PASSWORD),
        'access_version': '1',
        'admin_version': '1',
        'site_title': SITE_TITLE,
        'welcome': WELCOME,
        'admin_magic_code': ADMIN_MAGIC_CODE,
    }
    for k,v in defaults.items():
        row = con.execute('SELECT value FROM settings WHERE key=?', (k,)).fetchone()
        if row is None:
            con.execute('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)', (k,v,now_iso()))
    ensure_public_names(con)
    replace_old_auto_nicknames(con)
    dedupe_existing_nicknames(con)
    con.commit(); con.close()


def hash_password(pw: str) -> str:
    salt = hashlib.sha256((SECRET_KEY + ':salt').encode()).hexdigest()[:16]
    return hashlib.pbkdf2_hmac('sha256', pw.encode(), salt.encode(), 200000).hex()


def get_setting(key: str, default: str = '') -> str:
    con = db(); row = con.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone(); con.close()
    return row['value'] if row else default


def set_setting(key: str, value: str):
    con = db(); con.execute('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', (key,value,now_iso())); con.commit(); con.close()


def bump_version(key: str):
    v = int(get_setting(key, '1') or '1') + 1
    set_setting(key, str(v))
    return v


def verify_password(pw: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_password(pw), stored_hash)


def make_cookie(data: dict) -> str:
    return serializer.dumps(data)


def read_cookie(request: Request, name: str) -> Optional[dict]:
    raw = request.cookies.get(name)
    if not raw: return None
    try:
        data = serializer.loads(raw)
        return data if isinstance(data, dict) else None
    except BadSignature:
        return None


def random_profile():
    rng = random.SystemRandom()
    return rng.choice(POETIC_NICKNAMES), rng.choice(PRESET_AVATARS)


def norm_nick(s: str) -> str:
    return (s or '').strip().lower()


def nickname_rule_error(nickname: str) -> Optional[str]:
    # 昵称规则（不含查重）：非空、不能只有一个字。返回错误文案或 None。
    n = (nickname or '').strip()
    if not n: return '昵称不能为空'
    if len(n) < 2: return '昵称至少需要 2 个字'
    return None

def nickname_taken(con: sqlite3.Connection, nickname: str, exclude_uid: Optional[str] = None) -> bool:
    # 去首尾空格 + 不区分大小写判重
    n = norm_nick(nickname)
    if not n: return False
    if exclude_uid:
        r = con.execute('SELECT 1 FROM users WHERE LOWER(TRIM(nickname))=? AND id<>? LIMIT 1', (n, exclude_uid)).fetchone()
    else:
        r = con.execute('SELECT 1 FROM users WHERE LOWER(TRIM(nickname))=? LIMIT 1', (n,)).fetchone()
    return bool(r)


def _rand_suffix2() -> str:
    rng = random.SystemRandom()
    alpha = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    return ''.join(rng.choice(alpha) for _ in range(2))


def unique_nickname(con: sqlite3.Connection, base: str, exclude_uid: Optional[str] = None) -> str:
    # 生成未被占用的昵称：被占则加 2 位随机后缀（多次冲突递增）。
    base = (base or '').strip()[:60] or '用户'
    if not nickname_taken(con, base, exclude_uid):
        return base
    for _ in range(40):
        cand = f'{base}{_rand_suffix2()}'[:60]
        if not nickname_taken(con, cand, exclude_uid):
            return cand
    return f'{base}{uuid.uuid4().hex[:4].upper()}'[:60]


def dedupe_existing_nicknames(con: sqlite3.Connection):
    # 存量重名：每组保留最早的一个，其余加 2 位随机后缀。
    try:
        groups = con.execute('SELECT LOWER(TRIM(nickname)) k, COUNT(*) c FROM users GROUP BY k HAVING c>1').fetchall()
        for g in groups:
            rows = con.execute('SELECT id, nickname FROM users WHERE LOWER(TRIM(nickname))=? ORDER BY created_at ASC, id ASC', (g['k'],)).fetchall()
            for r in rows[1:]:
                newnick = unique_nickname(con, (r['nickname'] or '用户').strip(), exclude_uid=r['id'])
                con.execute('UPDATE users SET nickname=?, updated_at=? WHERE id=?', (newnick, now_iso(), r['id']))
        con.commit()
    except Exception:
        pass


def gen_id_code(con: sqlite3.Connection | None = None) -> str:
    # 默认随机身份码：纯 6 位（大写字母+数字，去易混淆字符），保证唯一。
    rng = random.SystemRandom()
    alpha = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    own = con is None
    if own: con = db()
    try:
        for _ in range(50):
            code = ''.join(rng.choice(alpha) for _ in range(6))
            if not con.execute('SELECT 1 FROM users WHERE id_code=?', (code,)).fetchone():
                return code
        return uuid.uuid4().hex[:8].upper()
    finally:
        if own: con.close()




def replace_old_auto_nicknames(con: sqlite3.Connection):
    try:
        rows = con.execute('SELECT id, nickname FROM users').fetchall()
    except sqlite3.OperationalError:
        return
    idx = 0
    for r in rows:
        nick = r['nickname'] or ''
        if nick in OLD_NICK_PREFIXES or any(re.fullmatch(re.escape(prefix) + r'-\d{4}', nick) for prefix in OLD_NICK_PREFIXES):
            new_nick = POETIC_NICKNAMES[idx % len(POETIC_NICKNAMES)]
            con.execute('UPDATE users SET nickname=?, updated_at=? WHERE id=?', (new_nick, now_iso(), r['id']))
            idx += 1

def client_ip(request: Request) -> str:
    return request.headers.get('x-forwarded-for', request.client.host if request.client else '').split(',')[0].strip()

def is_intranet_ip(ip: str) -> bool:
    # 判断是否局域网私有段（真正的内网直连，如 192.168.x / 10.x / 172.16-31.x）。
    import ipaddress
    if not ip: return False
    try:
        a = ipaddress.ip_address(ip)
        return a.is_private and not a.is_loopback
    except Exception:
        return False

def ip_label(ip: str) -> str:
    # 直接原样显示 IP（不做内/外网文字替换）。
    return ip if ip else '未知'

@app.get('/api/whoami')
def whoami(request: Request):
    # 诊断：看 frp 到底透传了什么 IP。
    return {
        'client_host': request.client.host if request.client else None,
        'x_forwarded_for': request.headers.get('x-forwarded-for'),
        'x_real_ip': request.headers.get('x-real-ip'),
        'client_ip_resolved': client_ip(request),
    }


def get_current_user(request: Request) -> Optional[sqlite3.Row]:
    data = read_cookie(request, 'lanchat_auth')
    if not data or data.get('v') != get_setting('access_version','1'):
        return None
    uid = data.get('uid')
    if not uid: return None
    con = db(); row = con.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
    if row:
        con.execute('UPDATE users SET last_seen_at=?, last_ip=? WHERE id=?', (now_iso(), client_ip(request), uid)); con.commit()
    con.close(); return row


def require_user(request: Request) -> sqlite3.Row:
    u = get_current_user(request)
    if not u: raise HTTPException(401, 'auth required')
    return u


def viewer_uid_of(request: Request) -> Optional[str]:
    # 轻量获取当前访问者 uid（不写库），用于公开直链的私人文件属主判定。
    try:
        data = read_cookie(request, 'lanchat_auth')
        if not data or data.get('v') != get_setting('access_version','1'): return None
        return data.get('uid')
    except Exception:
        return None


def is_admin(request: Request) -> bool:
    data = read_cookie(request, 'lanchat_admin')
    return bool(data and data.get('admin') and data.get('v') == get_setting('admin_version','1'))


def require_admin(request: Request):
    if not is_admin(request): raise HTTPException(401, 'admin required')

def require_user_or_admin(request: Request):
    u = get_current_user(request)
    if u: return u
    if is_admin(request): return None
    raise HTTPException(401, 'auth required')


def safe_name(name: str) -> str:
    name = Path(name or 'file').name
    name = re.sub(r'[\\/\0\r\n\t]+', '_', name)
    name = re.sub(r'[^\w.\-\u4e00-\u9fff ()（）\[\]【】]+', '_', name, flags=re.UNICODE)
    return name[:180] or 'file'


RESERVED_PUBLIC_NAMES = {'', 'api', 'static', 'admin', 'files', 'file', 'i', 'ws', 'favicon.ico'}


def public_name_parts(name: str):
    clean = safe_name(name or 'file')
    clean = clean.strip(' .') or 'file'
    ext = Path(clean).suffix
    stem = clean[:-len(ext)] if ext else clean
    stem = stem.strip(' .') or 'file'
    return stem[:150], ext[:24]


def public_name_exists(con: sqlite3.Connection, name: str, exclude_id: str = '') -> bool:
    row = con.execute('SELECT id FROM files WHERE public_name=? AND deleted=0 AND id<>? LIMIT 1', (name, exclude_id)).fetchone()
    return row is not None


def make_public_name(con: sqlite3.Connection, original: str, fid: str) -> str:
    stem, ext = public_name_parts(original)
    first = f'{stem}{ext}'
    if first.split('/')[0].lower() in RESERVED_PUBLIC_NAMES or public_name_exists(con, first, fid):
        suffix = fid.replace('-', '')[:8]
        first = f'{stem[:max(1, 170 - len(suffix) - len(ext))]}-{suffix}{ext}'
    i = 2
    candidate = first
    while candidate.split('/')[0].lower() in RESERVED_PUBLIC_NAMES or public_name_exists(con, candidate, fid):
        suffix = f'{fid.replace("-", "")[:8]}-{i}'
        candidate = f'{stem[:max(1, 170 - len(suffix) - len(ext))]}-{suffix}{ext}'
        i += 1
    return candidate


def ensure_public_names(con: sqlite3.Connection):
    try:
        rows = con.execute('SELECT id, original_name, public_name FROM files WHERE deleted=0 ORDER BY created_at, id').fetchall()
    except sqlite3.OperationalError:
        return
    changed = False
    for r in rows:
        if r['public_name']:
            continue
        public_name = make_public_name(con, r['original_name'], r['id'])
        con.execute('UPDATE files SET public_name=? WHERE id=?', (public_name, r['id']))
        changed = True
    if changed:
        con.commit()


def file_kind(filename: str, mime: Optional[str]) -> str:
    ext = Path(filename).suffix.lower()
    m = (mime or '').lower()
    if ext in IMG_EXTS or m.startswith('image/'): return 'image'
    if ext in VIDEO_EXTS or m.startswith('video/'): return 'video'
    if ext in AUDIO_EXTS or m.startswith('audio/'): return 'audio'
    if ext in TEXT_EXTS or m.startswith('text/') or m in {'application/json','application/xml','application/javascript','application/x-sh','application/yaml','application/x-yaml'}: return 'text'
    return 'file'


def _preview_score(path: Path) -> int:
    try:
        return path.stat().st_size
    except Exception:
        return 0


def _frame_brightness(path: Path, t: str) -> float:
    # 用 ffmpeg signalstats 测指定时间点帧的平均亮度 YAVG（0~255），抽不到返回 -1。
    try:
        proc = subprocess.run(
            ['ffmpeg','-hide_banner','-nostats','-ss',t,'-i',str(path),'-frames:v','1',
             '-vf','signalstats,metadata=print','-f','null','-'],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=15, check=False)
        out = proc.stderr.decode('utf-8','ignore')
        m = re.search(r'YAVG=([0-9.]+)', out)
        return float(m.group(1)) if m else -1.0
    except Exception:
        return -1.0


def make_video_preview(path: Path) -> Optional[str]:
    if shutil.which('ffmpeg') is None:
        return None
    # 只在「前几秒」密集抽帧（保持预览贴近开场，点播放不突兑），
    # 用亮度检测跳过黑场/纯色空白帧（实况照/深色开场常见）。
    times = ['0.2','0.5','0.8','1','1.3','1.6','2','2.5','3','3.5','4','5']
    DARK = 24.0  # YAVG 低于此视为黑场/几乎全黑
    chosen: Optional[str] = None
    best_t, best_y = None, -1.0
    for t in times:
        y = _frame_brightness(path, t)
        if y > best_y:
            best_y, best_t = y, t
        if y >= DARK:  # 第一个足够亮的早帧，直接用
            chosen = t
            break
    if chosen is None:
        chosen = best_t or '1'  # 全部偏黑时退而取最亮的一帧
    out = PREVIEWS_DIR / f'{uuid.uuid4().hex}.jpg'
    try:
        cmd = [
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-ss', chosen, '-i', str(path), '-frames:v', '1',
            '-vf', 'scale=720:-2:force_original_aspect_ratio=decrease',
            '-q:v', '3', str(out)
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15, check=False)
        if out.exists() and out.stat().st_size > 0:
            return str(out.relative_to(DATA_DIR))
    except Exception:
        try:
            if out.exists(): out.unlink()
        except Exception:
            pass
    return None


def make_preview(path: Path, kind: str) -> Optional[str]:
    if kind == 'video':
        return make_video_preview(path)
    if kind != 'image' or Image is None: return None
    ext = path.suffix.lower()
    if ext in {'.jpg','.jpeg','.png','.gif','.webp','.avif','.bmp','.svg'}:
        return None
    try:
        im = Image.open(path)
        im.thumbnail((1600,1600))
        out = PREVIEWS_DIR / f'{path.stem}.png'
        im.save(out, 'PNG')
        return str(out.relative_to(DATA_DIR))
    except Exception:
        return None


def user_public(row: sqlite3.Row | dict) -> dict:
    r = dict(row)
    avatar_url = None
    if r.get('avatar_type') == 'upload': avatar_url = f"/api/avatar/{r.get('avatar_value')}"
    return {'id': r['id'], 'nickname': r['nickname'], 'avatar_type': r.get('avatar_type','preset'), 'avatar_value': r.get('avatar_value','🙂'), 'avatar_url': avatar_url}


def file_public(row: Optional[sqlite3.Row]) -> Optional[dict]:
    if not row: return None
    r = dict(row)
    preview_url = f"/api/file/{r['id']}/preview" if r.get('preview_path') else None
    public_name = r.get('public_name') or r.get('original_name') or r['id']
    public_url = '/' + public_name.lstrip('/')
    kind = r.get('kind','file')
    # 兼容旧记录：功能上线前上传的 txt/md/json 等在数据库里可能还是 file
    if kind == 'file':
        kind = file_kind(r.get('original_name',''), r.get('mime'))
    return {'id':r['id'],'user_id':r.get('user_id'),'name':r['original_name'],'public_name':public_name,'mime':r.get('mime'),'size':r.get('size',0),'kind':kind,'url':f"/api/file/{r['id']}/download",'view_url':f"/api/file/{r['id']}/view",'page_url':public_url,'public_url':public_url,'public_view_url':public_url,'public_download_url':f"/file/{r['id']}/download",'preview_url':preview_url,'public_preview_url':f"/file/{r['id']}/preview" if r.get('preview_path') else None,'admin_view_url':f"/api/admin/file/{r['id']}/raw",'admin_download_url':f"/api/admin/file/{r['id']}/download",'admin_preview_url':f"/api/admin/file/{r['id']}/preview" if r.get('preview_path') else None,'admin_page_url':f"/api/admin/file/{r['id']}/raw",'created_at':r['created_at']}


def message_public(row: sqlite3.Row) -> dict:
    con = db()
    user = con.execute('SELECT * FROM users WHERE id=?', (row['user_id'],)).fetchone()
    f = con.execute('SELECT * FROM files WHERE id=?', (row['file_id'],)).fetchone() if row['file_id'] else None
    file_user = con.execute('SELECT nickname FROM users WHERE id=?', (f['user_id'],)).fetchone() if f else None
    con.close()
    fd = file_public(f)
    if fd:
        fd['uploader'] = file_user['nickname'] if file_user else '未知用户'
    return {'id':row['id'],'user':user_public(user) if user else None,'user_id':row['user_id'],'content':row['content'],'msg_type':row['msg_type'],'file':fd,'private':bool(row['private']) if 'private' in row.keys() else False,'withdrawn':bool(row['withdrawn']),'deleted':bool(row['deleted']),'edited':bool(row['edited']),'created_at':row['created_at'],'updated_at':row['updated_at']}


def visible_file_ids_for_users(con: sqlite3.Connection) -> set[str]:
    # 普通用户侧只展示仍被未撤回消息引用的文件。后台不使用这个过滤。
    rows = con.execute('SELECT DISTINCT file_id FROM messages WHERE deleted=0 AND withdrawn=0 AND file_id IS NOT NULL').fetchall()
    return {r['file_id'] for r in rows}

def cleanup_tmp_uploads(max_age_seconds: int = 24*3600):
    try:
        cutoff = time.time() - max_age_seconds
        for p in TMP_UPLOADS_DIR.iterdir():
            try:
                if p.is_dir() and p.stat().st_mtime < cutoff:
                    shutil.rmtree(p, ignore_errors=True)
            except Exception:
                pass
    except Exception:
        pass


def upload_session_dir(upload_id: str) -> Path:
    if not re.fullmatch(r'[a-f0-9]{32}', upload_id or ''):
        raise HTTPException(400, 'bad upload id')
    return TMP_UPLOADS_DIR / upload_id


def load_upload_meta(upload_id: str) -> dict:
    p = upload_session_dir(upload_id) / 'meta.json'
    if not p.exists():
        raise HTTPException(404, 'upload session not found')
    return json.loads(p.read_text())


def save_upload_meta(upload_id: str, meta: dict):
    d = upload_session_dir(upload_id); d.mkdir(parents=True, exist_ok=True)
    (d / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False))


def finalize_uploaded_file(user: sqlite3.Row, original: str, source: Path, mime: str, content: str, preview_source: Optional[Path] = None, private: int = 0):
    original=safe_name(original or 'file'); ext=Path(original).suffix.lower(); stored=f"{uuid.uuid4().hex}{ext}"; dest=UPLOADS_DIR/stored
    shutil.move(str(source), dest)
    size=dest.stat().st_size; kind=file_kind(original,mime); preview_path=make_preview(dest,kind)
    # 预览图一律用后端 ffmpeg 生成（不再采用前端 canvas poster，标已废弃）。
    if preview_source is not None and preview_source.exists():
        try: preview_source.unlink()
        except Exception: pass
    fid=str(uuid.uuid4()); mid=str(uuid.uuid4()); rel=str(dest.relative_to(DATA_DIR)); now=now_iso()
    is_private=1 if private else 0
    con=db(); public_name=make_public_name(con, original, fid); con.execute('INSERT INTO files(id,user_id,original_name,stored_name,public_name,path,preview_path,mime,size,kind,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(fid,user['id'],original,stored,public_name,rel,preview_path,mime,size,kind,now))
    con.execute('INSERT INTO messages(id,user_id,content,msg_type,file_id,private,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',(mid,user['id'],content,kind,fid,is_private,now,now))
    con.commit(); row=con.execute('SELECT * FROM messages WHERE id=?',(mid,)).fetchone(); con.close()
    return message_public(row), is_private

class Hub:
    def __init__(self): self.clients: dict[WebSocket, Optional[str]] = {}
    async def connect(self, ws: WebSocket, uid: Optional[str]=None): await ws.accept(); self.clients[ws]=uid
    def disconnect(self, ws: WebSocket): self.clients.pop(ws, None)
    async def broadcast(self, payload: dict):
        dead=[]
        for ws in list(self.clients.keys()):
            try: await ws.send_json(payload)
            except Exception: dead.append(ws)
        for ws in dead: self.disconnect(ws)
    async def broadcast_private(self, payload: dict, owner_uid: str):
        # 私人消息只发给属主自己的在线连接（cookie 解出的 uid 匹配）。
        dead=[]
        for ws, uid in list(self.clients.items()):
            if uid != owner_uid: continue
            try: await ws.send_json(payload)
            except Exception: dead.append(ws)
        for ws in dead: self.disconnect(ws)
    async def send_to_user(self, payload: dict, target_uid: str):
        """定向发给某个用户的所有在线连接（用于 P2P 信令转发）。"""
        dead=[]
        for ws, uid in list(self.clients.items()):
            if uid != target_uid: continue
            try: await ws.send_json(payload)
            except Exception: dead.append(ws)
        for ws in dead: self.disconnect(ws)
    def is_online(self, uid: str) -> bool:
        """检查某用户是否在线（至少有一个活跃 WS 连接）。"""
        return any(u == uid for u in self.clients.values())

hub = Hub()
init_db()

async def broadcast_msg(msg: dict, kind: str = 'message'):
    # 根据消息是否私人选择定向还是群发。private 消息只发给属主。
    if msg.get('private'):
        await hub.broadcast_private({'type':kind,'message':msg}, msg.get('user_id'))
    else:
        await hub.broadcast({'type':kind,'message':msg})

@app.get('/', response_class=HTMLResponse)
def index():
    page=(Path(__file__).parent/'static/index.html').read_text(encoding='utf-8')
    t=get_setting('site_title', SITE_TITLE)
    return page.replace('<title>LAN Chat</title>', f'<title>{html.escape(t)}</title>', 1)
@app.get('/files', response_class=HTMLResponse)
def files_page(request: Request):
    if not get_current_user(request):
        return RedirectResponse('/')
    page=(Path(__file__).parent/'static/files.html').read_text(encoding='utf-8')
    ft=get_setting('files_title', FILES_TITLE)
    page=page.replace('<title>文件目录 - LAN Chat</title>', f'<title>{html.escape(ft)}</title>', 1)
    page=page.replace('<h1>文件目录</h1>', f'<h1>{html.escape(ft)}</h1>', 1)
    return page
@app.get('/admin', response_class=HTMLResponse)
def admin_page():
    page=(Path(__file__).parent/'static/admin.html').read_text(encoding='utf-8')
    t=get_setting('site_title', SITE_TITLE)
    return page.replace('<title>管理后台 - LAN Chat</title>', f'<title>管理后台 - {html.escape(t)}</title>', 1)

@app.get('/api/config')
def api_config(request: Request):
    u = get_current_user(request)
    user = None
    if u:
        user = user_public(u)
        # 仅本人可见的自己 IP（不走 user_public，避免随每条消息广播给所有人）
        try: user['last_ip'] = ip_label(dict(u).get('last_ip'))
        except Exception: pass
    return {'title': get_setting('site_title', SITE_TITLE), 'authed': bool(u), 'user': user, 'admin': is_admin(request)}

@app.post('/api/login')
async def login(request: Request):
    data = await request.json()
    if not verify_password(str(data.get('password','')), get_setting('access_password_hash')):
        raise HTTPException(403, '密码不对')
    uid = str(uuid.uuid4())
    nick, avatar = random_profile()
    con = db(); idc = gen_id_code(con); nick = unique_nickname(con, nick); con.execute('INSERT INTO users(id,nickname,avatar_type,avatar_value,id_code,created_at,updated_at,last_seen_at,last_ip) VALUES(?,?,?,?,?,?,?,?,?)', (uid,nick,'preset',avatar,idc,now_iso(),now_iso(),now_iso(),client_ip(request))); con.commit(); con.close()
    resp = JSONResponse({'ok': True, 'user': {'id':uid,'nickname':nick,'avatar_type':'preset','avatar_value':avatar}})
    resp.set_cookie('lanchat_auth', make_cookie({'uid':uid,'v':get_setting('access_version','1')}), max_age=10*365*24*3600, httponly=True, samesite='lax')
    return resp

@app.post('/api/logout')
def logout():
    resp = JSONResponse({'ok': True}); resp.delete_cookie('lanchat_auth'); return resp

@app.get('/api/me')
def me(request: Request): return {'user': user_public(require_user(request))}

@app.get('/api/ws-token')
def ws_token(request: Request):
    """返回 WS 连接用的 token（兼容 WebSocket 不带 cookie 的浏览器）"""
    u = require_user(request)
    return {'token': make_cookie({'uid': u['id'], 'v': get_setting('access_version', '1')})}

@app.get('/api/identity')
def get_identity(request: Request):
    u = require_user(request); r = dict(u)
    return {'id_code': r.get('id_code') or '', 'has_secret': bool(r.get('secret_hash'))}

@app.post('/api/identity/save')
async def save_identity(request: Request):
    # 设置/修改身份码与个人密码。身份码本身即凭证，密码可空。
    # 已有密码：改身份码/密码都需验原密码。无密码：随便改。
    u = require_user(request); r = dict(u); data = await request.json()
    new_code = str(data.get('id_code') or '').strip()[:60]
    new_secret = str(data.get('new_secret') or '')
    old_secret = str(data.get('old_secret') or '')
    has_secret = bool(r.get('secret_hash'))
    if has_secret:
        if not verify_password(old_secret, r.get('secret_hash')):
            raise HTTPException(403, '原密码不正确')
    if not new_code:
        raise HTTPException(400, '身份码不能为空')
    if new_code != (r.get('id_code') or ''):
        con=db(); dup=con.execute('SELECT id FROM users WHERE id_code=? AND id<>?', (new_code, u['id'])).fetchone(); con.close()
        if dup: raise HTTPException(409, '该身份码已被占用，请换一个')
    # 密码可空：空 new_secret + has_secret → 不改密码；空 new_secret + 无密码 → 保持无密码。
    if new_secret and len(new_secret) < 4:
        raise HTTPException(400, '密码至少 4 位')
    secret_hash = hash_password(new_secret) if new_secret else r.get('secret_hash')
    con=db(); con.execute('UPDATE users SET id_code=?, secret_hash=?, updated_at=? WHERE id=?', (new_code, secret_hash, now_iso(), u['id'])); con.commit(); con.close()
    return {'ok': True, 'id_code': new_code, 'has_secret': bool(secret_hash)}

_recover_hits: dict[str, list[float]] = {}
def _recover_rate_ok(ip: str) -> bool:
    # 同 IP 每分钟 ≤ 5 次恢复尝试。
    now = time.time(); win = 60.0; lim = 5
    hits = [t for t in _recover_hits.get(ip, []) if now - t < win]
    if len(hits) >= lim:
        _recover_hits[ip] = hits; return False
    hits.append(now); _recover_hits[ip] = hits; return True

@app.post('/api/identity/recover')
async def recover_identity(request: Request):
    # 用身份码(+密码) 恢复/绑定旧身份：合并当前 uid 的消息/文件到目标 uid，删当前 uid，cookie 切目标。
    cur = require_user(request); data = await request.json()
    ip = client_ip(request)
    if not _recover_rate_ok(ip):
        raise HTTPException(429, '尝试太频繁，请稍后再试')
    code = str(data.get('id_code') or '').strip()[:60]
    secret = str(data.get('secret') or '')
    if not code:
        raise HTTPException(400, '请输入身份码')
    con=db(); target=con.execute('SELECT * FROM users WHERE id_code=?', (code,)).fetchone(); con.close()
    if not target:
        raise HTTPException(404, '身份码不存在')
    tr=dict(target)
    # 目标有密码才验证；空密码身份凭码即可恢复。
    if tr.get('secret_hash'):
        if not verify_password(secret, tr.get('secret_hash')):
            raise HTTPException(403, '密码不正确')
    if tr['id'] == cur['id']:
        raise HTTPException(400, '已是当前身份，无需恢复')
    # 合并：当前 uid 的消息/文件挂到目标 uid，然后删除当前 uid。
    con=db()
    con.execute('UPDATE messages SET user_id=? WHERE user_id=?', (tr['id'], cur['id']))
    con.execute('UPDATE files SET user_id=? WHERE user_id=?', (tr['id'], cur['id']))
    con.execute('DELETE FROM users WHERE id=?', (cur['id'],))
    con.execute('UPDATE users SET last_seen_at=?, last_ip=? WHERE id=?', (now_iso(), ip, tr['id']))
    con.commit(); row=con.execute('SELECT * FROM users WHERE id=?', (tr['id'],)).fetchone(); con.close()
    user = user_public(row); user['last_ip'] = ip_label(dict(row).get('last_ip'))
    resp = JSONResponse({'ok': True, 'user': user})
    resp.set_cookie('lanchat_auth', make_cookie({'uid':tr['id'],'v':get_setting('access_version','1')}), max_age=10*365*24*3600, httponly=True, samesite='lax')
    return resp

@app.get('/api/nickname/check')
def nickname_check(request: Request, nickname: str = ''):
    u = require_user(request)
    err = nickname_rule_error(nickname)
    if err: return {'ok': False, 'reason': err}
    con = db()
    taken = nickname_taken(con, nickname, exclude_uid=u['id']); con.close()
    if taken: return {'ok': False, 'reason': '昵称已被占用，换一个'}
    return {'ok': True}

@app.post('/api/profile')
async def profile(request: Request):
    u = require_user(request); data = await request.json()
    nickname = str(data.get('nickname') or u['nickname']).strip()[:60] or u['nickname']
    avatar_type = data.get('avatar_type') or u['avatar_type']; avatar_value = data.get('avatar_value') or u['avatar_value']
    if avatar_type not in ['preset','upload']: avatar_type='preset'
    if avatar_type == 'preset' and avatar_value not in PRESET_AVATARS: avatar_value = PRESET_AVATARS[0]
    rerr = nickname_rule_error(nickname)
    if rerr: raise HTTPException(400, rerr)
    con=db()
    if nickname_taken(con, nickname, exclude_uid=u['id']): con.close(); raise HTTPException(409, '昵称已被占用，换一个')
    con.execute('UPDATE users SET nickname=?, avatar_type=?, avatar_value=?, updated_at=? WHERE id=?',(nickname,avatar_type,avatar_value,now_iso(),u['id'])); con.commit(); row=con.execute('SELECT * FROM users WHERE id=?',(u['id'],)).fetchone(); con.close()
    user=user_public(row)
    try: user['last_ip']=ip_label(dict(row).get('last_ip'))
    except Exception: pass
    return {'ok': True, 'user': user}

@app.post('/api/avatar/upload')
async def upload_avatar(request: Request, file: UploadFile = File(...)):
    u = require_user(request)
    name = safe_name(file.filename or 'avatar')
    ext = Path(name).suffix.lower() or '.bin'
    stored = f"{uuid.uuid4().hex}{ext}"
    dest = AVATARS_DIR / stored
    with dest.open('wb') as out: shutil.copyfileobj(file.file, out)
    con=db(); con.execute('UPDATE users SET avatar_type=?, avatar_value=?, updated_at=? WHERE id=?',('upload',stored,now_iso(),u['id'])); con.commit(); con.close()
    return {'ok': True, 'avatar_value': stored, 'avatar_url': f'/api/avatar/{stored}'}

@app.get('/api/avatar/{name}')
def avatar(name: str):
    p = AVATARS_DIR / safe_name(name)
    if not p.exists(): raise HTTPException(404)
    return FileResponse(p)


@app.get('/api/users/{uid}/profile')
def user_profile(uid: str, request: Request, limit: int = 300):
    me=require_user(request); limit=max(1,min(limit,1000)); con=db()
    u=con.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
    if not u:
        con.close(); raise HTTPException(404)
    # 私人消息仅在看自己资料页时可见；看别人资料页只看群聊消息。
    if me['id']==uid:
        rows=con.execute('SELECT * FROM messages WHERE user_id=? AND deleted=0 ORDER BY created_at DESC LIMIT ?', (uid,limit)).fetchall()
    else:
        rows=con.execute('SELECT * FROM messages WHERE user_id=? AND deleted=0 AND private=0 ORDER BY created_at DESC LIMIT ?', (uid,limit)).fetchall()
    con.close()
    return {
        'user': {
            **user_public(u),
            'created_at': u['created_at'],
            'updated_at': u['updated_at'],
            'last_seen_at': u['last_seen_at'],
            'last_ip': ip_label(u['last_ip']),
            'online': hub.is_online(uid),
        },
        'messages': [message_public(r) for r in rows]
    }

@app.get('/api/presets')
def presets(request: Request): require_user(request); return {'avatars': PRESET_AVATARS}

@app.get('/api/messages')
def list_messages(request: Request, before: Optional[str]=None, after: Optional[str]=None, around: Optional[str]=None, start: Optional[str]=None, end: Optional[str]=None, limit: int=120, scope: str='public'):
    u=require_user(request); limit=max(1,min(limit,300)); con=db()
    # A 方案：群聊视图只看 private=0；私人视图只看自己的 private=1。
    if scope=='private':
        cond='deleted=0 AND private=1 AND user_id=?'; base=[u['id']]
    else:
        cond='deleted=0 AND private=0'; base=[]
    # 1) 时间区间模式：返回 [start,end] 内所有消息（正序）
    if start or end:
        extra=''; ea=[]
        if start: extra+=' AND created_at>=?'; ea.append(start)
        if end: extra+=' AND created_at<=?'; ea.append(end)
        rows=con.execute(f'SELECT * FROM messages WHERE {cond}{extra} ORDER BY created_at ASC LIMIT ?', (*base,*ea,limit)).fetchall()
        con.close(); return {'messages':[message_public(r) for r in rows]}
    # 2) around 模式：以某条消息为中心，前后各 limit/2 条（用于搜索跳转带上下文）
    if around:
        half=max(10,limit//2)
        anchor=con.execute('SELECT created_at FROM messages WHERE id=?',(around,)).fetchone()
        if anchor:
            ac=anchor['created_at']
            older=con.execute(f'SELECT * FROM messages WHERE {cond} AND created_at<=? ORDER BY created_at DESC LIMIT ?', (*base,ac,half)).fetchall()
            newer=con.execute(f'SELECT * FROM messages WHERE {cond} AND created_at>? ORDER BY created_at ASC LIMIT ?', (*base,ac,half)).fetchall()
            merged=list(reversed(older))+list(newer)
            con.close(); return {'messages':[message_public(r) for r in merged], 'around': around}
    # 3) 向上翻页：before 游标
    if before:
        rows=con.execute(f'SELECT * FROM messages WHERE {cond} AND created_at < (SELECT created_at FROM messages WHERE id=?) ORDER BY created_at DESC LIMIT ?', (*base,before,limit)).fetchall()
    elif after:
        rows=con.execute(f'SELECT * FROM messages WHERE {cond} AND created_at > (SELECT created_at FROM messages WHERE id=?) ORDER BY created_at ASC LIMIT ?', (*base,after,limit)).fetchall()
        con.close(); return {'messages':[message_public(r) for r in rows]}
    else:
        rows=con.execute(f'SELECT * FROM messages WHERE {cond} ORDER BY created_at DESC LIMIT ?', (*base,limit)).fetchall()
    con.close(); return {'messages':[message_public(r) for r in reversed(rows)]}

@app.get('/api/search')
def search(request: Request, q: str='', limit: int=60, scope: str='public'):
    u=require_user(request); q=(q or '').strip(); limit=max(1,min(limit,200))
    if not q:
        return {'messages': [], 'files': []}
    like=f'%{q}%'
    con=db()
    # 按视图隔离：群聊=private=0；私人=自己的 private=1。
    if scope=='private':
        mcond='deleted=0 AND withdrawn=0 AND private=1 AND user_id=?'; margs=[u['id']]
        fsub='SELECT DISTINCT file_id FROM messages WHERE deleted=0 AND withdrawn=0 AND private=1 AND user_id=? AND file_id IS NOT NULL'; fsubargs=[u['id']]
    else:
        mcond='deleted=0 AND withdrawn=0 AND private=0'; margs=[]
        fsub='SELECT DISTINCT file_id FROM messages WHERE deleted=0 AND withdrawn=0 AND private=0 AND file_id IS NOT NULL'; fsubargs=[]
    mrows=con.execute(f'SELECT * FROM messages WHERE {mcond} AND content LIKE ? ORDER BY created_at DESC LIMIT ?', (*margs, like, limit)).fetchall()
    frows=con.execute(f'''SELECT files.*, users.nickname FROM files LEFT JOIN users ON files.user_id=users.id
        WHERE files.deleted=0 AND files.original_name LIKE ?
          AND files.id IN ({fsub})
        ORDER BY files.created_at DESC LIMIT ?''', (like, *fsubargs, limit)).fetchall()
    con.close()
    files=[]
    for r in frows:
        d=file_public(r); d['uploader']=r['nickname']; files.append(d)
    return {'messages': [message_public(r) for r in mrows], 'files': files, 'q': q}

@app.post('/api/messages')
async def send_message(request: Request):
    u=require_user(request); data=await request.json(); content=str(data.get('content',''))
    # 后台快捷暗号：内容完全等于暗号时，不存库/不广播，直接升级为管理员并提示前端跳转。
    magic=get_setting('admin_magic_code', ADMIN_MAGIC_CODE)
    if magic and content.strip()==magic:
        resp=JSONResponse({'ok':True,'admin_redirect':True})
        resp.set_cookie('lanchat_admin', make_cookie({'admin':True,'v':get_setting('admin_version','1')}), max_age=10*365*24*3600, httponly=True, samesite='lax')
        return resp
    mid=str(uuid.uuid4()); is_private=1 if data.get('private') else 0; con=db(); con.execute('INSERT INTO messages(id,user_id,content,msg_type,private,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',(mid,u['id'],content,'text',is_private,now_iso(),now_iso())); con.commit(); row=con.execute('SELECT * FROM messages WHERE id=?',(mid,)).fetchone(); con.close()
    msg=message_public(row)
    if is_private:
        await hub.broadcast_private({'type':'message','message':msg}, u['id'])
    else:
        await hub.broadcast({'type':'message','message':msg})
    return {'ok':True,'message':msg}

@app.post('/api/upload-session')
async def create_upload_session(request: Request):
    u=require_user(request); cleanup_tmp_uploads(); data=await request.json()
    upload_id=uuid.uuid4().hex; total_size=int(data.get('size') or 0); chunk_size=int(data.get('chunk_size') or 0)
    if total_size < 0 or chunk_size <= 0 or chunk_size > 16*1024*1024:
        raise HTTPException(400, 'bad size')
    lim=get_setting('upload_size_limit','0')
    if lim and lim.isdigit() and int(lim)>0 and total_size > int(lim)*1024*1024:
        raise HTTPException(413, f'文件大小超过限制({lim}MB)')
    meta={'id':upload_id,'user_id':u['id'],'name':safe_name(str(data.get('name') or 'file')),'size':total_size,'mime':str(data.get('mime') or 'application/octet-stream'),'content':str(data.get('content') or ''),'private':1 if data.get('private') else 0,'chunk_size':chunk_size,'created_at':now_iso(),'received':[]}
    save_upload_meta(upload_id, meta)
    return {'ok': True, 'upload_id': upload_id, 'received': []}

@app.get('/api/upload-session/{upload_id}')
def get_upload_session(upload_id: str, request: Request):
    u=require_user(request); meta=load_upload_meta(upload_id)
    if meta.get('user_id') != u['id']: raise HTTPException(403)
    return {'ok': True, 'upload_id': upload_id, 'received': meta.get('received', []), 'size': meta.get('size', 0)}

@app.post('/api/upload-session/{upload_id}/chunk')
async def upload_session_chunk(upload_id: str, request: Request, index: int = Form(...), chunk: UploadFile = File(...)):
    u=require_user(request); meta=load_upload_meta(upload_id)
    if meta.get('user_id') != u['id']: raise HTTPException(403)
    idx=int(index); total_size=int(meta.get('size') or 0); chunk_size=int(meta.get('chunk_size') or 1); total_chunks=(total_size + chunk_size - 1)//chunk_size if total_size else 0
    if idx < 0 or (total_chunks and idx >= total_chunks): raise HTTPException(400, 'bad chunk index')
    d=upload_session_dir(upload_id); part=d/f'chunk_{idx:08d}.part'; tmp=d/f'chunk_{idx:08d}.tmp'; written=0
    with tmp.open('wb') as out:
        while True:
            buf=await chunk.read(1024*1024)
            if not buf: break
            written += len(buf); out.write(buf)
    tmp.replace(part)
    received=set(int(x) for x in meta.get('received', [])); received.add(idx); meta['received']=sorted(received); meta['updated_at']=now_iso(); save_upload_meta(upload_id, meta)
    return {'ok': True, 'received': meta['received'], 'written': written}

@app.post('/api/upload-session/{upload_id}/preview')
async def upload_session_preview(upload_id: str, request: Request, preview: UploadFile = File(...)):
    u=require_user(request); meta=load_upload_meta(upload_id)
    if meta.get('user_id') != u['id']: raise HTTPException(403)
    pmime=(preview.content_type or '').lower()
    if not pmime.startswith('image/'): raise HTTPException(400, 'bad preview')
    pname=safe_name(preview.filename or 'preview.jpg'); pext=Path(pname).suffix.lower() or '.jpg'
    if pext not in {'.jpg','.jpeg','.png','.webp'}: pext='.jpg'
    d=upload_session_dir(upload_id); dest=d/f'preview{pext}'; tmp=d/f'preview.tmp'; total=0
    with tmp.open('wb') as out:
        while True:
            buf=await preview.read(1024*1024)
            if not buf: break
            total += len(buf)
            if total > 4*1024*1024: raise HTTPException(400, 'preview too large')
            out.write(buf)
    tmp.replace(dest); meta['preview_file']=dest.name; meta['updated_at']=now_iso(); save_upload_meta(upload_id, meta)
    return {'ok': True}

@app.post('/api/upload-session/{upload_id}/complete')
async def complete_upload_session(upload_id: str, request: Request):
    u=require_user(request); meta=load_upload_meta(upload_id)
    if meta.get('user_id') != u['id']: raise HTTPException(403)
    d=upload_session_dir(upload_id); total_size=int(meta.get('size') or 0); chunk_size=int(meta.get('chunk_size') or 1); total_chunks=(total_size + chunk_size - 1)//chunk_size if total_size else len(meta.get('received', []))
    received=set(int(x) for x in meta.get('received', [])); missing=[i for i in range(total_chunks) if i not in received]
    if missing: raise HTTPException(400, f'missing chunks: {missing[:5]}')
    assembled=d/'assembled.bin'
    with assembled.open('wb') as out:
        for i in range(total_chunks):
            part=d/f'chunk_{i:08d}.part'
            if not part.exists(): raise HTTPException(400, 'missing chunk')
            with part.open('rb') as inp: shutil.copyfileobj(inp,out)
    if total_size and assembled.stat().st_size != total_size: raise HTTPException(400, 'size mismatch')
    preview_source=None
    if meta.get('preview_file'):
        pp=d/meta['preview_file']
        if pp.exists(): preview_source=pp
    msg, is_private=finalize_uploaded_file(u, meta.get('name') or 'file', assembled, meta.get('mime') or 'application/octet-stream', meta.get('content') or '', preview_source, 1 if meta.get('private') else 0)
    shutil.rmtree(d, ignore_errors=True)
    if is_private:
        await hub.broadcast_private({'type':'message','message':msg}, u['id'])
    else:
        await hub.broadcast({'type':'message','message':msg})
    return {'ok': True, 'message': msg}

@app.post('/api/upload-session/{upload_id}/cancel')
def cancel_upload_session(upload_id: str, request: Request):
    u=require_user(request); meta=load_upload_meta(upload_id)
    if meta.get('user_id') != u['id']: raise HTTPException(403)
    shutil.rmtree(upload_session_dir(upload_id), ignore_errors=True)
    return {'ok': True}

@app.post('/api/upload')
async def upload(request: Request, file: UploadFile = File(...), preview: Optional[UploadFile] = File(None), content: str = Form(''), private: str = Form('')):
    u=require_user(request); original=safe_name(file.filename or 'file'); ext=Path(original).suffix.lower(); stored=f"{uuid.uuid4().hex}{ext}"; dest=UPLOADS_DIR/stored
    lim=get_setting('upload_size_limit','0')
    if lim and lim.isdigit() and int(lim)>0: lim_bytes=int(lim)*1024*1024
    else: lim_bytes=0
    size=0
    with dest.open('wb') as out:
        while True:
            chunk=await file.read(1024*1024)
            if not chunk: break
            size += len(chunk); out.write(chunk)
            if lim_bytes and size>lim_bytes:
                dest.unlink(missing_ok=True)
                raise HTTPException(413, f'文件大小超过限制({lim}MB)')
    mime=file.content_type or mimetypes.guess_type(original)[0] or 'application/octet-stream'; kind=file_kind(original,mime); preview_path=make_preview(dest,kind)
    # 预览图一律用后端 ffmpeg 生成；忽略前端传来的 preview（canvas poster 已废弃）。
    _=preview
    fid=str(uuid.uuid4()); mid=str(uuid.uuid4()); rel=str(dest.relative_to(DATA_DIR))
    is_private=1 if str(private) in ('1','true','True','on') else 0
    con=db(); public_name=make_public_name(con, original, fid); con.execute('INSERT INTO files(id,user_id,original_name,stored_name,public_name,path,preview_path,mime,size,kind,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(fid,u['id'],original,stored,public_name,rel,preview_path,mime,size,kind,now_iso()))
    con.execute('INSERT INTO messages(id,user_id,content,msg_type,file_id,private,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',(mid,u['id'],content,kind,fid,is_private,now_iso(),now_iso()))
    con.commit(); row=con.execute('SELECT * FROM messages WHERE id=?',(mid,)).fetchone(); con.close()
    msg=message_public(row)
    if is_private:
        await hub.broadcast_private({'type':'message','message':msg}, u['id'])
    else:
        await hub.broadcast({'type':'message','message':msg})
    return {'ok':True,'message':msg}

@app.patch('/api/messages/{mid}')
async def edit_message(mid: str, request: Request):
    u=require_user(request); data=await request.json(); content=str(data.get('content',''))
    con=db(); row=con.execute('SELECT * FROM messages WHERE id=? AND deleted=0',(mid,)).fetchone()
    if not row: raise HTTPException(404)
    if row['user_id'] != u['id']: raise HTTPException(403)
    con.execute('UPDATE messages SET content=?, edited=1, updated_at=? WHERE id=?',(content,now_iso(),mid)); con.commit(); row=con.execute('SELECT * FROM messages WHERE id=?',(mid,)).fetchone(); con.close()
    msg=message_public(row); await broadcast_msg(msg,'update'); return {'ok':True,'message':msg}

@app.post('/api/messages/{mid}/withdraw')
async def withdraw(mid: str, request: Request):
    u=require_user(request); con=db(); row=con.execute('SELECT * FROM messages WHERE id=? AND deleted=0',(mid,)).fetchone()
    if not row: raise HTTPException(404)
    if row['user_id'] != u['id']: raise HTTPException(403)
    con.execute('UPDATE messages SET withdrawn=1, updated_at=? WHERE id=?',(now_iso(),mid)); con.commit(); row=con.execute('SELECT * FROM messages WHERE id=?',(mid,)).fetchone(); con.close()
    msg=message_public(row); await broadcast_msg(msg,'update'); return {'ok':True,'message':msg}


@app.post('/api/messages/{mid}/restore')
async def restore_own_message(mid: str, request: Request):
    u=require_user(request); con=db(); row=con.execute('SELECT * FROM messages WHERE id=? AND deleted=0',(mid,)).fetchone()
    if not row: raise HTTPException(404)
    if row['user_id'] != u['id']: raise HTTPException(403)
    if not row['withdrawn']:
        con.close(); return {'ok': True, 'message': message_public(row)}
    con.execute('UPDATE messages SET withdrawn=0, updated_at=? WHERE id=?',(now_iso(),mid)); con.commit(); row=con.execute('SELECT * FROM messages WHERE id=?',(mid,)).fetchone(); con.close()
    msg=message_public(row); await broadcast_msg(msg,'update'); return {'ok':True,'message':msg}


@app.post('/api/messages/{mid}/visibility')
async def change_visibility(mid: str, request: Request):
    # 单条消息改变模式：group<->private。仅本人。private→public 前端强确认。
    u=require_user(request); data=await request.json(); want_private=1 if data.get('private') else 0
    con=db(); row=con.execute('SELECT * FROM messages WHERE id=? AND deleted=0',(mid,)).fetchone()
    if not row: con.close(); raise HTTPException(404)
    if row['user_id'] != u['id']: con.close(); raise HTTPException(403)
    con.execute('UPDATE messages SET private=?, updated_at=? WHERE id=?',(want_private,now_iso(),mid)); con.commit(); row=con.execute('SELECT * FROM messages WHERE id=?',(mid,)).fetchone(); con.close()
    msg=message_public(row)
    # 先让所有在线客户端从当前视图移除这条（离开了原视图），再按新归属添加。
    await hub.broadcast({'type':'remove','id':mid})
    await broadcast_msg(msg,'message')
    return {'ok':True,'message':msg}



def get_file_row(fid: str):
    con=db(); f=con.execute('SELECT * FROM files WHERE id=? AND deleted=0',(fid,)).fetchone(); con.close(); return f


def get_public_file_row(fid: str, viewer_uid: Optional[str]=None):
    # 公开直链/外链：仅当文件仍被未撤回、未删除的消息引用时可见。撤回后失效，恢复后再次可用。
    # 私人文件（被 private=1 消息引用）：只有属主本人能访问。公开直链对非本人 404。
    con=db()
    # 引用该文件的可见消息：公开侧（private=0）任何人可见；私人侧仅属主。
    f=con.execute('''SELECT * FROM files WHERE id=? AND deleted=0 AND id IN (
        SELECT file_id FROM messages WHERE deleted=0 AND withdrawn=0 AND file_id IS NOT NULL
        AND (private=0 OR user_id=?)
    )''',(fid, viewer_uid or '')).fetchone()
    con.close(); return f

def safe_file_path(f):
    p=(DATA_DIR/f['path']).resolve()
    if not str(p).startswith(str(DATA_DIR.resolve())) or not p.exists(): raise HTTPException(404)
    return p

def delete_data_relative_file(rel: Optional[str]) -> bool:
    if not rel: return False
    try:
        p=(DATA_DIR/rel).resolve()
        if not str(p).startswith(str(DATA_DIR.resolve())): return False
        if p.exists() and p.is_file():
            p.unlink()
            return True
    except Exception:
        return False
    return False


def file_public_page_html(f: sqlite3.Row) -> str:
    kind=file_kind(f['original_name'], f['mime']); fid=f['id']; name=html.escape(f['original_name'] or 'file'); mime=html.escape(f['mime'] or 'application/octet-stream')
    raw=f"/file/{fid}/raw"; down=f"/file/{fid}/download"; preview=f"/file/{fid}/preview"; body=''
    if kind == 'image':
        body=f'<div class="viewer-media"><img src="{raw}" alt="{name}"></div>'
    elif kind == 'video':
        poster=f' poster="{preview}"' if f['preview_path'] else ''
        body=f'<div class="viewer-media"><video src="{raw}"{poster} controls preload="metadata"></video></div>'
    elif kind == 'audio':
        body=f'<div class="viewer-media audio"><audio src="{raw}" controls preload="metadata"></audio></div>'
    elif kind == 'text':
        try:
            p=safe_file_path(f); raw_bytes=p.read_bytes()
            if len(raw_bytes) > 5*1024*1024:
                text='文本文件超过 5MB，请下载后查看。'
            else:
                try: text=raw_bytes.decode('utf-8')
                except UnicodeDecodeError: text=raw_bytes.decode('gb18030', errors='replace')
        except Exception:
            text='文本读取失败。'
        body=f'<pre class="viewer-text">{html.escape(text)}</pre>'
    else:
        body='<div class="viewer-empty">此类型不支持在线预览，请下载后打开。</div>'
    css='''body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;background:radial-gradient(circle at 10% 0%,#dbe7ff 0,#eef3ff 35%,#f9fbff 100%);color:#132033;min-height:100dvh}.viewer-shell{max-width:1080px;margin:0 auto;padding:14px 14px 28px}.viewer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;padding:12px 14px;border-radius:22px;background:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.65);box-shadow:0 18px 60px rgba(43,68,120,.16);backdrop-filter:blur(18px)}.viewer-title{min-width:0}.viewer-title h1{margin:0;font-size:19px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.viewer-title p{margin:3px 0 0;color:#69758a;font-size:12px}.viewer-actions{display:flex;gap:8px;flex:0 0 auto}.viewer-actions a{border-radius:14px;padding:9px 12px;text-decoration:none;color:#132033;background:rgba(255,255,255,.72);border:1px solid rgba(102,119,153,.22)}.viewer-actions .primary{color:#fff;background:linear-gradient(135deg,#4f7cff,#7c4dff);border:0}.viewer-card{border-radius:24px;background:rgba(255,255,255,.82);border:1px solid rgba(102,119,153,.22);box-shadow:0 18px 60px rgba(43,68,120,.16);padding:12px;min-height:60vh;display:grid;place-items:center}.viewer-media{width:100%;display:grid;place-items:center}.viewer-media img,.viewer-media video{max-width:100%;max-height:calc(100dvh - 160px);border-radius:16px;background:#111827}.viewer-media audio{width:min(720px,100%)}.viewer-text{width:100%;height:calc(100dvh - 170px);overflow:auto;margin:0;padding:16px;border-radius:16px;background:#0f172a;color:#e5e7eb;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Microsoft YaHei Mono",monospace}.viewer-empty{color:#69758a;text-align:center;padding:40px}@media(max-width:720px){.viewer-shell{padding:8px}.viewer-head{border-radius:18px;padding:10px}.viewer-title h1{font-size:16px}.viewer-actions a{padding:8px 10px;font-size:13px}.viewer-card{border-radius:18px;padding:8px}.viewer-media img,.viewer-media video{max-height:calc(100dvh - 140px)}.viewer-text{height:calc(100dvh - 145px);font-size:13px;padding:12px}}'''
    css += 'html,body{height:100%;overflow:hidden}.viewer-shell{height:100dvh;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}.viewer-card{min-height:0;overflow:hidden}.viewer-text{height:100%!important;min-height:0;max-height:none!important;box-sizing:border-box;background-clip:padding-box;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}'
    return f'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{name}</title><link rel="icon" href="/favicon.ico"><style>{css}</style></head><body><main class="viewer-shell"><header class="viewer-head"><div class="viewer-title"><h1>{name}</h1><p>{html.escape(kind)} · {int(f["size"] or 0)} B · {mime}</p></div><div class="viewer-actions"><a href="/" class="ghost">聊天</a><a class="primary" href="{down}">下载</a></div></header><section class="viewer-card">{body}</section></main></body></html>'

@app.get('/file/{fid}', response_class=HTMLResponse)
def public_file_page(fid: str, request: Request):
    f=get_public_file_row(fid, viewer_uid_of(request))
    if not f: raise HTTPException(404)
    return file_public_page_html(f)

@app.get('/file/{fid}/raw')
def public_file_raw(fid: str, request: Request):
    f=get_public_file_row(fid, viewer_uid_of(request))
    if not f: raise HTTPException(404)
    p=safe_file_path(f)
    return FileResponse(p, media_type=f['mime'] or 'application/octet-stream')

@app.get('/file/{fid}/download')
def public_file_download(fid: str, request: Request):
    f=get_public_file_row(fid, viewer_uid_of(request))
    if not f: raise HTTPException(404)
    p=safe_file_path(f)
    return FileResponse(p, media_type=f['mime'] or 'application/octet-stream', filename=f['original_name'])

@app.get('/file/{fid}/preview')
def public_file_preview(fid: str, request: Request):
    f=get_public_file_row(fid, viewer_uid_of(request))
    if not f or not f['preview_path']: raise HTTPException(404)
    p=(DATA_DIR/f['preview_path']).resolve()
    if not str(p).startswith(str(DATA_DIR.resolve())) or not p.exists(): raise HTTPException(404)
    return FileResponse(p)

@app.get('/api/file/{fid}/text')
def read_text_file(fid: str, request: Request):
    require_user_or_admin(request); u=get_current_user(request); admin=is_admin(request)
    f=get_file_row(fid)
    if not f: raise HTTPException(404)
    if file_kind(f['original_name'], f['mime']) != 'text': raise HTTPException(400, '不是可在线查看的文本文件')
    p=safe_file_path(f)
    raw=p.read_bytes()
    if len(raw) > 5*1024*1024:
        raise HTTPException(413, '文本文件超过 5MB，暂不在线打开，请下载')
    try:
        text=raw.decode('utf-8')
        encoding='utf-8'
    except UnicodeDecodeError:
        text=raw.decode('gb18030', errors='replace')
        encoding='gb18030/replace'
    is_owner = bool(admin or (u and f['user_id'] == u['id']))
    return {'id': f['id'], 'user_id': f['user_id'], 'is_owner': is_owner, 'name': f['original_name'], 'size': f['size'], 'mime': f['mime'], 'encoding': encoding, 'content': text}

@app.patch('/api/file/{fid}/text')
async def update_text_file(fid: str, request: Request):
    u=get_current_user(request); admin=is_admin(request);
    if not u and not admin: raise HTTPException(401, 'auth required')
    data=await request.json(); f=get_file_row(fid)
    if not f: raise HTTPException(404)
    if file_kind(f['original_name'], f['mime']) != 'text': raise HTTPException(400, '不是可编辑文本文件')
    if not admin and (not u or f['user_id'] != u['id']):
        raise HTTPException(403, '只能编辑自己上传的文本文件')
    content=str(data.get('content',''))
    b=content.encode('utf-8')
    p=safe_file_path(f); p.write_bytes(b)
    con=db(); con.execute('UPDATE files SET size=?, mime=?, created_at=created_at WHERE id=?',(len(b), f['mime'] or 'text/plain', fid)); con.commit(); con.close()
    return {'ok': True, 'size': len(b)}

@app.get('/api/file/{fid}/view')
def view_file(fid: str, request: Request):
    u=require_user(request); con=db(); f=con.execute('SELECT * FROM files WHERE id=? AND deleted=0 AND id IN (SELECT file_id FROM messages WHERE deleted=0 AND withdrawn=0 AND file_id IS NOT NULL AND (private=0 OR user_id=?))',(fid,u['id'])).fetchone(); con.close()
    if not f: raise HTTPException(404)
    p=(DATA_DIR/f['path']).resolve()
    if not str(p).startswith(str(DATA_DIR.resolve())) or not p.exists(): raise HTTPException(404)
    # inline media/file view: no filename attachment header, so img/video/audio can render in browser
    return FileResponse(p, media_type=f['mime'] or 'application/octet-stream')


@app.post('/api/messages/{mid}/delete')
async def delete_own_message(mid: str, request: Request):
    # 普通用户不提供删除，只允许撤回；删除仅限后台管理员。
    raise HTTPException(403, '普通用户不能删除消息，只能撤回')

@app.get('/api/file/{fid}/download')
def download(fid: str, request: Request):
    u=require_user(request); con=db(); f=con.execute('SELECT * FROM files WHERE id=? AND deleted=0 AND id IN (SELECT file_id FROM messages WHERE deleted=0 AND withdrawn=0 AND file_id IS NOT NULL AND (private=0 OR user_id=?))',(fid,u['id'])).fetchone(); con.close()
    if not f: raise HTTPException(404)
    p=(DATA_DIR/f['path']).resolve()
    if not str(p).startswith(str(DATA_DIR.resolve())) or not p.exists(): raise HTTPException(404)
    return FileResponse(p, media_type=f['mime'] or 'application/octet-stream', filename=f['original_name'])

@app.get('/api/file/{fid}/preview')
def preview(fid: str, request: Request):
    u=require_user(request); con=db(); f=con.execute('SELECT * FROM files WHERE id=? AND deleted=0 AND id IN (SELECT file_id FROM messages WHERE deleted=0 AND withdrawn=0 AND file_id IS NOT NULL AND (private=0 OR user_id=?))',(fid,u['id'])).fetchone(); con.close()
    if not f or not f['preview_path']: raise HTTPException(404)
    p=(DATA_DIR/f['preview_path']).resolve()
    if not str(p).startswith(str(DATA_DIR.resolve())) or not p.exists(): raise HTTPException(404)
    return FileResponse(p)

@app.get('/api/files')
def list_files(request: Request, q: str='', kind: str='', scope: str='public'):
    u=require_user(request); con=db()
    if scope=='private':
        msub='SELECT DISTINCT file_id FROM messages WHERE deleted=0 AND withdrawn=0 AND file_id IS NOT NULL AND private=1 AND user_id=?'; args=[u['id']]
    else:
        msub='SELECT DISTINCT file_id FROM messages WHERE deleted=0 AND withdrawn=0 AND file_id IS NOT NULL AND private=0'; args=[]
    sql=f'''SELECT files.*, users.nickname FROM files LEFT JOIN users ON files.user_id=users.id WHERE files.deleted=0 AND files.id IN ({msub})'''
    if q: sql += ' AND files.original_name LIKE ?'; args.append(f'%{q}%')
    if kind=='mine':
        sql += ' AND files.user_id=?'; args.append(u['id'])
    elif kind: sql += ' AND files.kind=?'; args.append(kind)
    sql += ' ORDER BY files.created_at DESC LIMIT 1000'
    rows=con.execute(sql,args).fetchall()
    out=[]
    for r in rows:
        d=file_public(r); d['uploader']=r['nickname']
        d['is_owner']=(r['user_id']==u['id'])
        if scope=='private':
            mr=con.execute('SELECT id FROM messages WHERE file_id=? AND deleted=0 AND withdrawn=0 AND private=1 AND user_id=? ORDER BY created_at DESC LIMIT 1',(r['id'],u['id'])).fetchone()
        else:
            mr=con.execute('SELECT id FROM messages WHERE file_id=? AND deleted=0 AND withdrawn=0 AND private=0 ORDER BY created_at DESC LIMIT 1',(r['id'],)).fetchone()
        d['msg_id']=mr['id'] if mr else None
        out.append(d)
    con.close()
    # 快捷分享目录：公开模式且无搜索/筛选时混入列表，按时间统一混排
    if scope == 'public' and not q and not kind:
        out = scan_quick_drop() + out
        out.sort(key=lambda x: x.get('created_at',''), reverse=True)
    return {'files': out}


# ── 快捷分享目录（quick_drop）：往 /data/quick_drop/ 扔文件即自动出现在网盘页 ──

def scan_quick_drop() -> list[dict]:
    """扫描 quick_drop 目录，返回文件信息列表（不写数据库，纯目录扫描）。"""
    out = []
    try:
        for p in sorted(QUICK_DROP_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if not p.is_file(): continue
            name = p.name
            ext = p.suffix.lower()
            mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
            kind = file_kind(name, mime)
            st = p.stat()
            fid = 'qd_' + hashlib.md5(name.encode()).hexdigest()[:16]
            download_url = f"/api/quickdrop/{hashlib.md5(name.encode()).hexdigest()}/download"
            view_url = f"/api/quickdrop/{hashlib.md5(name.encode()).hexdigest()}/view"
            # 图片用 view 作为缩略图（直接返回原图，浏览器缩放显示）
            preview_url = view_url if kind == 'image' else None
            out.append({
                'id': fid,
                'name': name,
                'public_name': name,
                'mime': mime,
                'size': st.st_size,
                'kind': kind,
                'url': download_url,
                'view_url': view_url,
                'page_url': view_url,
                'public_url': view_url,
                'public_view_url': view_url,
                'public_download_url': download_url,
                'preview_url': preview_url,
                'public_preview_url': preview_url,
                'created_at': datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
                'uploader': '快捷分享',
                'is_owner': False,
                'msg_id': None,
                'quickdrop': True,
            })
    except Exception:
        pass
    return out


def _quickdrop_path(name_hash: str) -> Optional[Path]:
    """根据文件名的 md5 hash 找到 quick_drop 里的文件，防路径穿越。"""
    if not re.fullmatch(r'[a-f0-9]+', name_hash or ''):
        return None
    try:
        for p in QUICK_DROP_DIR.iterdir():
            if not p.is_file(): continue
            if hashlib.md5(p.name.encode()).hexdigest() == name_hash:
                resolved = p.resolve()
                if not str(resolved).startswith(str(QUICK_DROP_DIR.resolve())):
                    return None
                return resolved
    except Exception:
        pass
    return None


@app.get('/api/quickdrop/{name_hash}/download')
def quickdrop_download(name_hash: str, request: Request):
    require_user(request)
    p = _quickdrop_path(name_hash)
    if not p: raise HTTPException(404)
    return FileResponse(p, filename=p.name)


@app.get('/api/quickdrop/{name_hash}/view')
def quickdrop_view(name_hash: str, request: Request):
    require_user(request)
    p = _quickdrop_path(name_hash)
    if not p: raise HTTPException(404)
    mime = mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
    return FileResponse(p, media_type=mime)


@app.websocket('/ws')
async def websocket(ws: WebSocket):
    # WebSocket cookie auth, best-effort：解出 uid 用于私人消息定向推送；解不出的连接收不到任何私人消息。
    uid = None
    try:
        data = read_cookie(ws, 'lanchat_auth')
        if data: uid = data.get('uid')
    except Exception:
        uid = None
    # fallback: 某些浏览器（如 X浏览器）WebSocket 不带 cookie，尝试从 query 参数取 token
    if not uid:
        try:
            token = ws.query_params.get('token', '')
            if token:
                data = serializer.loads(token)
                if isinstance(data, dict): uid = data.get('uid')
        except Exception:
            pass
    await hub.connect(ws, uid)
    try:
        while True:
            raw = await ws.receive_text()
            # P2P 信令转发：客户端发来的 JSON 消息，带 p2p 前缀类型的转发给目标用户
            try:
                d = json.loads(raw)
            except Exception:
                continue
            t = d.get('type', '')
            # P2P 信令类型：p2p_offer / p2p_accept / p2p_reject / p2p_sdp / p2p_ice / p2p_cancel
            if t.startswith('p2p_') and uid and d.get('to'):
                payload = {k: v for k, v in d.items() if k != 'to'}
                payload['from'] = uid
                await hub.send_to_user(payload, d['to'])
    except WebSocketDisconnect:
        hub.disconnect(ws)

# Admin
@app.post('/api/admin/login')
async def admin_login(request: Request):
    data=await request.json()
    if not verify_password(str(data.get('password','')), get_setting('admin_password_hash')): raise HTTPException(403,'密码不对')
    resp=JSONResponse({'ok':True}); resp.set_cookie('lanchat_admin', make_cookie({'admin':True,'v':get_setting('admin_version','1')}), max_age=10*365*24*3600, httponly=True, samesite='lax'); return resp

@app.post('/api/admin/logout')
def admin_logout():
    resp=JSONResponse({'ok':True}); resp.delete_cookie('lanchat_admin'); return resp

@app.get('/api/admin/state')
def admin_state(request: Request): return {'admin': is_admin(request)}

@app.get('/api/admin/settings')
def admin_get_settings(request: Request):
    require_admin(request)
    return {
        'site_title': get_setting('site_title', SITE_TITLE),
        'files_title': get_setting('files_title', FILES_TITLE),
        'admin_magic_code': get_setting('admin_magic_code', ADMIN_MAGIC_CODE),
        'upload_size_limit': get_setting('upload_size_limit', '0'),
    }

@app.get('/api/admin/users')
def admin_users(request: Request, page: int = 1, per_page: int = 20, q: str = ''):
    require_admin(request); con=db()
    page=max(1,page); per_page=max(1,min(per_page,200))
    where=''; args=[]
    if q: where=' WHERE nickname LIKE ? OR last_ip LIKE ?'; args=[f'%{q}%',f'%{q}%']
    total=con.execute(f'SELECT COUNT(*) FROM users{where}',args).fetchone()[0]
    offset=(page-1)*per_page
    rows=con.execute(f'SELECT * FROM users{where} ORDER BY created_at DESC LIMIT ? OFFSET ?',[*args,per_page,offset]).fetchall(); con.close()
    out=[]
    for r in rows:
        d=dict(r); d['has_secret']=bool(d.get('secret_hash')); d.pop('secret_hash', None); d['last_ip']=ip_label(d.get('last_ip')); out.append(d)
    return {'users': out, 'total': total, 'page': page, 'per_page': per_page}

@app.post('/api/admin/users/{uid}/reset-secret')
def admin_reset_secret(uid: str, request: Request):
    # 管理员重置用户密码：清空 secret_hash 回到无密码态（凭身份码即可恢复）。不看明文。
    require_admin(request); con=db(); row=con.execute('SELECT id FROM users WHERE id=?',(uid,)).fetchone()
    if not row: con.close(); raise HTTPException(404)
    con.execute('UPDATE users SET secret_hash=NULL, updated_at=? WHERE id=?',(now_iso(),uid)); con.commit(); con.close()
    return {'ok': True}

@app.patch('/api/admin/users/{uid}')
async def admin_update_user(uid: str, request: Request):
    require_admin(request); data=await request.json(); con=db(); row=con.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
    if not row: raise HTTPException(404)
    new_nick=str(data.get('nickname',row['nickname'])).strip()[:60] or row['nickname']
    rerr=nickname_rule_error(new_nick)
    if rerr: con.close(); raise HTTPException(400, rerr)
    if nickname_taken(con, new_nick, exclude_uid=uid): con.close(); raise HTTPException(409, '昵称已被占用，换一个')
    con.execute('UPDATE users SET nickname=?, avatar_type=?, avatar_value=?, updated_at=? WHERE id=?',(new_nick,data.get('avatar_type',row['avatar_type']),data.get('avatar_value',row['avatar_value']),now_iso(),uid)); con.commit(); con.close(); return {'ok':True}


@app.delete('/api/admin/users/{uid}')
def admin_delete_user(uid: str, request: Request):
    require_admin(request)
    con=db(); row=con.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
    if not row:
        con.close(); raise HTTPException(404)
    # 删除用户身份本身；历史消息/文件记录保留，但会显示为未知用户，避免误删聊天记录。
    con.execute('DELETE FROM users WHERE id=?',(uid,))
    con.commit(); con.close()
    return {'ok': True}

@app.get('/api/admin/messages')
def admin_messages(request: Request, q: str='', include_deleted: int = 0, page: int = 1, per_page: int = 30):
    require_admin(request); con=db(); sql='SELECT * FROM messages WHERE 1=1'; args=[]
    if not include_deleted: sql += ' AND deleted=0'
    if q: sql+=' AND content LIKE ?'; args.append(f'%{q}%')
    total=con.execute(f'SELECT COUNT(*) FROM ({sql})',args).fetchone()[0]
    page=max(1,page); per_page=max(1,min(per_page,200)); offset=(page-1)*per_page
    sql+=' ORDER BY created_at DESC LIMIT ? OFFSET ?'; args.extend([per_page,offset])
    rows=con.execute(sql,args).fetchall(); con.close()
    return {'messages':[message_public(r) for r in rows], 'total': total, 'page': page, 'per_page': per_page}


@app.post('/api/admin/messages/batch')
async def admin_batch_messages(request: Request):
    require_admin(request); data=await request.json(); ids=data.get('ids') or []; action=data.get('action')
    ids=[str(x) for x in ids if x]
    if not ids: return {'ok': True, 'count': 0}
    if action not in ['withdraw','restore','delete']:
        raise HTTPException(400, 'bad action')
    placeholders=','.join(['?']*len(ids))
    if action == 'withdraw': sets='withdrawn=1, updated_at=?'; args=[now_iso(), *ids]
    elif action == 'restore': sets='withdrawn=0, deleted=0, updated_at=?'; args=[now_iso(), *ids]
    else: sets='deleted=1, updated_at=?'; args=[now_iso(), *ids]
    con=db(); con.execute(f'UPDATE messages SET {sets} WHERE id IN ({placeholders})', args)
    if action == 'restore':
        # 恢复消息时连带恢复其引用的软删除文件
        con.execute(f'UPDATE files SET deleted=0 WHERE id IN (SELECT file_id FROM messages WHERE id IN ({placeholders}) AND file_id IS NOT NULL)', ids)
    con.commit(); rows=con.execute(f'SELECT * FROM messages WHERE id IN ({placeholders})', ids).fetchall(); con.close()
    for row in rows:
        await broadcast_msg(message_public(row),'update')
    return {'ok': True, 'count': len(ids)}

@app.patch('/api/admin/messages/{mid}')
async def admin_update_message(mid: str, request: Request):
    require_admin(request); data=await request.json(); fields=[]; args=[]
    for k in ['content','withdrawn','deleted']:
        if k in data: fields.append(f'{k}=?'); args.append(data[k])
    if not fields: return {'ok':True}
    fields.append('edited=1'); fields.append('updated_at=?'); args.append(now_iso()); args.append(mid)
    con=db(); con.execute(f"UPDATE messages SET {', '.join(fields)} WHERE id=?", args)
    # 恢复消息（deleted=0/withdrawn=0）时，连带恢复其引用的文件（软删除过的）
    if data.get('deleted')==0 or data.get('withdrawn')==0:
        mrow=con.execute('SELECT file_id FROM messages WHERE id=?',(mid,)).fetchone()
        if mrow and mrow['file_id']:
            con.execute('UPDATE files SET deleted=0 WHERE id=?',(mrow['file_id'],))
    con.commit(); row=con.execute('SELECT * FROM messages WHERE id=?',(mid,)).fetchone(); con.close()
    if row:
        msg=message_public(row); await broadcast_msg(msg,'update')
    return {'ok':True}

@app.get('/api/admin/files')
def admin_files(request: Request, q: str='', kind: str='', page: int = 1, per_page: int = 30):
    require_admin(request); con=db(); sql='SELECT files.*, users.nickname FROM files LEFT JOIN users ON files.user_id=users.id WHERE files.deleted=0'; args=[]
    if q: sql += ' AND files.original_name LIKE ?'; args.append(f'%{q}%')
    if kind: sql += ' AND files.kind=?'; args.append(kind)
    total=con.execute(f'SELECT COUNT(*) FROM ({sql})',args).fetchone()[0]
    page=max(1,page); per_page=max(1,min(per_page,200)); offset=(page-1)*per_page
    sql += ' ORDER BY files.created_at DESC LIMIT ? OFFSET ?'; args.extend([per_page,offset])
    rows=con.execute(sql,args).fetchall()
    # 哪些文件被私人消息引用（用于后台标识）
    priv_ids={r['file_id'] for r in con.execute('SELECT DISTINCT file_id FROM messages WHERE private=1 AND deleted=0 AND file_id IS NOT NULL').fetchall()}
    con.close()
    out=[]
    for r in rows:
        d=file_public(r); d['uploader']=r['nickname']; d['user_id']=r['user_id']; d['private']=r['id'] in priv_ids; out.append(d)
    return {'files': out, 'total': total, 'page': page, 'per_page': per_page}


def admin_file_row(fid: str):
    # 后台专用：不过滤撤回/未被引用，只要 deleted=0 就能访问。
    con=db(); f=con.execute('SELECT * FROM files WHERE id=? AND deleted=0',(fid,)).fetchone(); con.close(); return f

@app.get('/api/admin/file/{fid}/raw')
def admin_file_raw(fid: str, request: Request):
    require_admin(request); f=admin_file_row(fid)
    if not f: raise HTTPException(404)
    p=safe_file_path(f)
    return FileResponse(p, media_type=f['mime'] or 'application/octet-stream')

@app.get('/api/admin/file/{fid}/download')
def admin_file_download(fid: str, request: Request):
    require_admin(request); f=admin_file_row(fid)
    if not f: raise HTTPException(404)
    p=safe_file_path(f)
    return FileResponse(p, media_type=f['mime'] or 'application/octet-stream', filename=f['original_name'])

@app.get('/api/admin/file/{fid}/preview')
def admin_file_preview(fid: str, request: Request):
    require_admin(request); f=admin_file_row(fid)
    if not f or not f['preview_path']: raise HTTPException(404)
    p=(DATA_DIR/f['preview_path']).resolve()
    if not str(p).startswith(str(DATA_DIR.resolve())) or not p.exists(): raise HTTPException(404)
    return FileResponse(p)

@app.patch('/api/admin/files/{fid}/kind')
async def admin_update_file_kind(fid: str, request: Request):
    require_admin(request); data=await request.json(); kind=str(data.get('kind','')).strip()
    if kind not in ['image','video','audio','text','file']:
        raise HTTPException(400, 'bad kind')
    con=db(); con.execute('UPDATE files SET kind=? WHERE id=?',(kind,fid)); con.commit(); con.close()
    return {'ok': True}

@app.delete('/api/admin/files/{fid}')
def admin_delete_file(fid: str, request: Request):
    require_admin(request); con=db(); f=con.execute('SELECT * FROM files WHERE id=?',(fid,)).fetchone()
    if not f:
        con.close(); raise HTTPException(404)
    removed = []
    for rel in [f['path'], f['preview_path']]:
        if delete_data_relative_file(rel): removed.append(rel)
    con.execute('UPDATE files SET deleted=1 WHERE id=?',(fid,))
    con.execute('UPDATE messages SET deleted=1, updated_at=? WHERE file_id=?',(now_iso(),fid))
    con.commit(); con.close()
    return {'ok': True, 'removed_files': removed}

@app.post('/api/admin/files/batch-delete')
async def admin_batch_delete_files(request: Request):
    require_admin(request); data=await request.json(); ids=data.get('ids') or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(400, 'no ids')
    # 批量删除只软删除数据库记录，不物理删除文件，便于误操作后恢复。
    con=db(); deleted=0
    for fid in ids:
        f=con.execute('SELECT * FROM files WHERE id=?',(str(fid),)).fetchone()
        if not f: continue
        con.execute('UPDATE files SET deleted=1 WHERE id=?',(str(fid),))
        con.execute('UPDATE messages SET deleted=1, updated_at=? WHERE file_id=?',(now_iso(),str(fid)))
        deleted+=1
    con.commit(); con.close()
    return {'ok': True, 'deleted': deleted}


@app.patch('/api/admin/settings')
async def admin_settings(request: Request):
    require_admin(request); data=await request.json()
    if data.get('access_password'):
        set_setting('access_password_hash', hash_password(str(data['access_password']))); bump_version('access_version')
    if data.get('admin_password'):
        set_setting('admin_password_hash', hash_password(str(data['admin_password']))); bump_version('admin_version')
    if data.get('site_title') is not None and str(data.get('site_title')).strip(): set_setting('site_title', str(data['site_title']).strip()[:80])
    if data.get('files_title') is not None and str(data.get('files_title')).strip(): set_setting('files_title', str(data['files_title']).strip()[:80])
    if data.get('admin_magic_code') is not None: set_setting('admin_magic_code', str(data['admin_magic_code']).strip()[:60])
    if data.get('upload_size_limit') is not None:
        v=str(data['upload_size_limit']).strip()
        set_setting('upload_size_limit', v if (v=='' or (v.isdigit() and int(v)>=0)) else '0')
    return {'ok':True}

@app.post('/api/admin/clear-messages')
def admin_clear(request: Request):
    require_admin(request); con=db(); con.execute('UPDATE messages SET deleted=1, updated_at=?',(now_iso(),)); con.commit(); con.close(); return {'ok':True}


@app.get('/{public_name:path}')
def public_direct_file(public_name: str, request: Request):
    public_name = public_name.strip('/')
    if not public_name or '/' in public_name or public_name.split('/')[0].lower() in RESERVED_PUBLIC_NAMES:
        raise HTTPException(404)
    me = viewer_uid_of(request) or ''
    con=db(); f=con.execute('SELECT * FROM files WHERE public_name=? AND deleted=0 AND id IN (SELECT file_id FROM messages WHERE deleted=0 AND withdrawn=0 AND file_id IS NOT NULL AND (private=0 OR user_id=?))', (public_name, me)).fetchone(); con.close()
    if not f: raise HTTPException(404)
    p=safe_file_path(f)
    media_type=f['mime'] or mimetypes.guess_type(f['original_name'])[0] or 'application/octet-stream'
    resp=FileResponse(p, media_type=media_type)
    resp.headers['Access-Control-Allow-Origin']='*'
    resp.headers['Cross-Origin-Resource-Policy']='cross-origin'
    return resp
