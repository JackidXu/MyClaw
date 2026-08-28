#!/bin/bash

# 确保脚本在出错时立即退出
set -e

# 获取当前分支
CURRENT_BRANCH=$(git symbolic-ref --short -q HEAD)

echo "当前分支为: $CURRENT_BRANCH"

# 获取输入参数或提示输入
VERSION=$1
if [ -z "$VERSION" ]; then
  read -p "请输入要发布的新版本号 (例如 0.4.1): " VERSION
fi

# 检查输入是否为空
if [ -z "$VERSION" ]; then
  echo "错误: 版本号不能为空！"
  exit 1
fi

# 去除可能包含的 'v' 或 'V' 前缀以得到纯版本号
CLEAN_VERSION=$(echo "$VERSION" | sed 's/^[vV]//')
TAG_NAME="v$CLEAN_VERSION"

echo "准备发布版本: $CLEAN_VERSION"
echo "对应的 Git Tag: $TAG_NAME"

# 1. 更新 package.json 中的版本号
echo "正在更新 package.json 版本号..."
npm version "$CLEAN_VERSION" --no-git-tag-version --allow-same-version

# 2. 提交版本号修改
if git status --porcelain | grep -q "package.json"; then
  echo "正在提交版本号更新..."
  git add package.json
  git commit -m "chore(release): bump version to v$CLEAN_VERSION"
else
  echo "package.json 版本号未发生变化，跳过 commit。"
fi

# 3. 强制创建/覆盖本地 Tag，防止已存在时报错中断
echo "正在创建 Tag: $TAG_NAME..."
git tag -f "$TAG_NAME"

# 4. 自动推送到远程仓库以触发打包流水线
echo "正在推送代码和 Tag 至远程仓库以触发流水线..."
git push origin "$CURRENT_BRANCH"
git push origin -f "$TAG_NAME"

echo ""
echo "✓ 发布流程已完成！代码和 Tag 已推送，打包流水线已触发。"
