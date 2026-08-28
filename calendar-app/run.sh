#!/usr/bin/env bash
# 启动日历应用
# 优先使用 .venv（标准环境），否则使用本机已装好的 .pylocal（本沙箱环境无系统 pip 时）
cd "$(dirname "$0")"

if [ -x .venv/bin/python ]; then
  PY=.venv/bin/python
elif [ -d .pylocal/local/local/lib/python3.14/dist-packages ]; then
  export PYTHONPATH="$PWD/.pylocal/local/local/lib/python3.14/dist-packages"
  PY=python3
else
  PY=python3
fi

echo "== 日历服务启动中： http://127.0.0.1:5000 =="
exec "$PY" app.py
