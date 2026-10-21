每次修改都做代码提交
有远端的就同时推送
不要写任何测试代码， 除非是有明确指示
不要使用分支开发， 仅在main上开发迭代
github 的 gh 命令已经登录授权， 优先使用

项目是github的仓库时候 复杂的调整， 先提交issue，把问题和解决方案梳理清楚
问题定义创建issue
解决方案评论issue
解决后提交推送并且关闭issue

优先使用本地记忆系统

管理员为无配图需求生成或关联配图时，使用 `$jack-cases-requirement-visuals`；这是管理 Agent 工作流，不属于平台功能。

             Codex
               │
        ┌──────┴──────┐
        │             │
    AGENTS.md      STATE.md
      rules        working state
                      │
              ┌───────┴────────┐
              │                │
           MEMORY.md       GitHub Issues
        project knowledge    task truth
              │
              ▼
       SQLite FTS
       historical memory
