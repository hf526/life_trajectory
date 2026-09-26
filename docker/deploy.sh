#!/usr/bin/env bash
# ==============================================================================
# 人生工具箱（life_trajectory）部署脚本（Ubuntu，纯静态站）
#
# 统一约定（详见 web-svcs-deploy 技能）：
#   · 项目代码落在服务器 /home/docker_svc/life_trajectory
#   · 纯静态站：本脚本把仓库里的静态文件同步到共享 nginx 容器的 html 目录，再 reload nginx
#   · 代码怎么上服务器不归本脚本管（由 DeployCode 推送）
#   · 无构建步骤，改完 js/css 直接跑本脚本上线
#
# 用法：
#   sudo bash docker/deploy.sh
#
# ★ 本项目要改的地方：
#   1. SITE_DOMAIN  —— 结尾打印访问地址用。
#   2. WEB_ROOT     —— 共享 nginx 的 html 目标目录（容器内挂载为 /usr/share/nginx/html）。
#   3. NGINX_RELOAD —— 纯静态站必须 reload 才生效，默认 1。
#
# 环境变量（全部可覆盖）：
#   APP_DIR / SRC_DIR / WEB_ROOT / NGINX_RELOAD / NGINX_CONTAINER / KEEP_BACKUP / SITE_DOMAIN
#
# 注意：本文件必须以 LF 换行保存（不要 CRLF），否则服务器上会报
#       bad interpreter: /bin/sh^M。仓库里的 .gitattributes 已做约束。
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SRC_DIR="${SRC_DIR:-$APP_DIR}"
WEB_ROOT="${WEB_ROOT:-/home/docker_svc/nginx/html/life_trajectory}"
NGINX_RELOAD="${NGINX_RELOAD:-1}"
NGINX_CONTAINER="${NGINX_CONTAINER:-nginx}"
KEEP_BACKUP="${KEEP_BACKUP:-0}"
SITE_DOMAIN="${SITE_DOMAIN:-life.lefng.top}"

log()  { printf '\n==> %s\n' "$*"; }
warn() { printf '!! %s\n' "$*" >&2; }
fail() { printf '!! %s\n' "$*" >&2; exit 1; }

# --- 1. 前置检查 --------------------------------------------------------------
[ -d "$SRC_DIR" ]            || fail "源目录不存在：$SRC_DIR"
[ -f "$SRC_DIR/index.html" ] || fail "在 $SRC_DIR 下找不到 index.html，SRC_DIR 指错了？"
[ -f "$SRC_DIR/app.js" ]     || fail "在 $SRC_DIR 下找不到 app.js，可能不是站点根目录"

HTML_ROOT="$(dirname "$WEB_ROOT")"
mkdir -p "$HTML_ROOT" 2>/dev/null || fail "无法创建 $HTML_ROOT，权限不足就加 sudo"
[ -w "$HTML_ROOT" ] || fail "目标父目录不可写：$HTML_ROOT"

log "源目录   ：$SRC_DIR"
log "目标目录 ：$WEB_ROOT"

# --- 2. 同步文件 --------------------------------------------------------------
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
  log "同步方式 ：rsync"
  mkdir -p "$STAGING"
  rsync -a --exclude-from="$EXCLUDE_FILE" "$SRC_DIR"/ "$STAGING"/
else
  log "同步方式 ：tar（本机没有 rsync）"
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

# --- 3. 校验并 reload nginx ---------------------------------------------------
if [ "$NGINX_RELOAD" = "1" ]; then
  if command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
    if docker ps --format '{{.Names}}' | grep -qx "$NGINX_CONTAINER"; then
      docker exec "$NGINX_CONTAINER" nginx -t \
        || fail "nginx -t 未通过，已跳过 reload（站点配置有问题，改好再重跑）"
      log "reload nginx"
      docker exec "$NGINX_CONTAINER" nginx -s reload
    else
      warn "容器 $NGINX_CONTAINER 没在跑，跳过 reload（改名了就用 NGINX_CONTAINER 覆盖）"
    fi
  else
    warn "本机 docker 不可用，跳过 reload，请手动执行："
    warn "      docker exec $NGINX_CONTAINER nginx -s reload"
  fi
fi

# --- 4. 汇总 ------------------------------------------------------------------
FILE_COUNT="$(find "$WEB_ROOT" -type f | wc -l | tr -d ' ')"
SITE_SIZE="$(du -sh "$WEB_ROOT" | cut -f1)"
log "部署完成：共 $FILE_COUNT 个文件，占用 $SITE_SIZE"
echo "  访问地址：http://$SITE_DOMAIN/"