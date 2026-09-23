#!/usr/bin/env sh
# ------------------------------------------------------------
# 人生工具箱（life_trajectory）静态站点部署脚本
#
# 这个站是纯静态的，没有构建步骤：做的事就是把仓库里的静态文件
# 同步到 nginx 的 html 目录，然后 reload nginx。
#
# 用法（在服务器上执行）：
#   cd /home/code/life_trajectory     # 换成你实际的仓库路径
#   sh docker/deploy.sh
#
# 可用环境变量覆盖：
#   SRC_DIR          源目录，默认脚本所在目录的上一级（即仓库根）
#   WEB_ROOT         目标站点目录，默认 /home/docker_svc/nginx/html/life_trajectory
#   NGINX_CONTAINER  nginx 容器名，默认 nginx
#   KEEP_BACKUP      是否保留上一版本，默认 0 关闭，设为 1 时旧版本留在 WEB_ROOT.bak
#   SITE_DOMAIN      结尾提示用的域名，默认 life.lefng.top
#
# 注意：本文件必须以 LF 换行保存（不要 CRLF），否则服务器上会报
#       bad interpreter: /bin/sh^M。仓库里的 .gitattributes 已做约束。
# ------------------------------------------------------------
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="${SRC_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
WEB_ROOT="${WEB_ROOT:-/home/docker_svc/nginx/html/life_trajectory}"
NGINX_CONTAINER="${NGINX_CONTAINER:-nginx}"
KEEP_BACKUP="${KEEP_BACKUP:-0}"
SITE_DOMAIN="${SITE_DOMAIN:-life.lefng.top}"

log()  { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

# --- 1. 前置检查 -----------------------------------------------------------
[ -d "$SRC_DIR" ]            || fail "源目录不存在：$SRC_DIR"
[ -f "$SRC_DIR/index.html" ] || fail "在 $SRC_DIR 下找不到 index.html，SRC_DIR 指错了？"
[ -f "$SRC_DIR/app.js" ]     || fail "在 $SRC_DIR 下找不到 app.js，可能不是站点根目录"

HTML_ROOT="$(dirname "$WEB_ROOT")"
mkdir -p "$HTML_ROOT" 2>/dev/null || fail "无法创建 $HTML_ROOT，权限不足就加 sudo"
[ -w "$HTML_ROOT" ] || fail "目标父目录不可写：$HTML_ROOT"

log "源目录   : $SRC_DIR"
log "目标目录 : $WEB_ROOT"

# --- 2. 同步文件 -----------------------------------------------------------
# 排除清单走文件而不是命令行拼接：避免 *.md 这类 pattern 被 shell 展开，
# rsync 的 --exclude-from 和 tar 的 -X 都吃这个格式，一份两用。
EXCLUDE_FILE="${TMPDIR:-/tmp}/lt-docker-exclude.$$"
cat > "$EXCLUDE_FILE" <<EOF
.git
.github
.gitattributes
.gitignore
.workbuddy
docker
node_modules
Thumbs.db
.DS_Store
*.md
*.log
EOF
trap 'rm -f "$EXCLUDE_FILE"' EXIT INT TERM

if [ "$KEEP_BACKUP" = "1" ] && [ -d "$WEB_ROOT" ]; then
    log "备份旧版本 -> $WEB_ROOT.bak"
    rm -rf "$WEB_ROOT.bak"
    mv "$WEB_ROOT" "$WEB_ROOT.bak"
fi

STAGING="$WEB_ROOT.__new__"
rm -rf "$STAGING"

if command -v rsync >/dev/null 2>&1; then
    log "同步方式  : rsync"
    mkdir -p "$STAGING"
    rsync -a --exclude-from="$EXCLUDE_FILE" "$SRC_DIR"/ "$STAGING"/
else
    log "同步方式  : tar（本机没有 rsync）"
    mkdir -p "$STAGING"
    (cd "$SRC_DIR" && tar -cf - -X "$EXCLUDE_FILE" .) | (cd "$STAGING" && tar -xf -)
fi

# 整体替换而不是先删旧站：中途失败时旧版本还在，不会留一个空目录给 nginx
OLD="$WEB_ROOT.__old__"
if [ -d "$WEB_ROOT" ]; then
    rm -rf "$OLD"
    mv "$WEB_ROOT" "$OLD"
fi
mv "$STAGING" "$WEB_ROOT"
rm -rf "$OLD"

# 确保 nginx 容器里的用户（www-data/nginx）读得到
chmod -R a+rX "$WEB_ROOT"

# --- 3. reload nginx -------------------------------------------------------
if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$NGINX_CONTAINER"; then
        log "校验 nginx 配置..."
        docker exec "$NGINX_CONTAINER" nginx -t
        log "reload nginx..."
        docker exec "$NGINX_CONTAINER" nginx -s reload
        log "nginx 已 reload"
    else
        log "警告：容器 $NGINX_CONTAINER 没在跑，跳过 reload（改名了就用 NGINX_CONTAINER 覆盖）"
    fi
else
    log "警告：本机 docker 不可用，跳过 reload，请手动执行："
    log "      docker exec $NGINX_CONTAINER nginx -s reload"
fi

# --- 4. 收尾 ---------------------------------------------------------------
FILE_COUNT="$(find "$WEB_ROOT" -type f | wc -l | tr -d ' ')"
SITE_SIZE="$(du -sh "$WEB_ROOT" | cut -f1)"
log "部署完成：共 $FILE_COUNT 个文件，占用 $SITE_SIZE"
log "访问地址：http://$SITE_DOMAIN/"
