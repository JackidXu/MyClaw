export const settingsAndImTranslations = {
  zh: {
    // ContentDistributionSettings
    contentDistHowToGetCredentials: '如何获取凭据：',
    contentDistStep1: '打开您电脑上已登录的「蚁小二」客户端；',
    contentDistStep2: '点击客户端左侧导航栏的「CLI」菜单；',
    contentDistStep3: '复制「API Key」与「Client ID」，分别填入下方输入框中，并点击右下角保存。',
    contentDistDetecting: '检测中...',
    contentDistApiKeyLabel: '蚁小二 API Key',
    contentDistApiKeyPlaceholder: '请输入您的蚁小二 API Key',
    contentDistApiKeyHelp: '用于身份鉴权。重置后旧令牌会失效，请确保与蚁小二客户端中显示一致。',
    contentDistClientIdLabel: '本机 Client ID',
    contentDistClientIdPlaceholder: '例如：_9bvKq... (从蚁小二客户端获取)',
    contentDistClientIdRecommendPrefix: '强烈推荐填写：',
    contentDistClientIdRecommendDesc: '填写后任务将直接由本机蚁小二客户端执行，走您当前的宽带网络发布，天然免风控、账号不掉线。若未显示请确认本机客户端已运行。',

    // EmailSkillConfig
    emailTroubleshootPromptHeader: '我在配置邮件的 IMAP/SMTP 连接时遇到了问题，请帮我排查并给出解决方案。',
    emailTroubleshootAccount: '邮箱账号：{account}',
    emailTroubleshootAddress: '邮箱地址：{email}',
    emailTroubleshootImap: 'IMAP 服务器：{host}:{port}',

    // Agent settings & creation
    agentLevelSenior: '高级',
    agentLevelMiddle: '中级',
    agentLevelJunior: '初级',
    agentDeptOther: '其他',

    // IM & Feishu/DingTalk
    imFetchQrCodeFailed: '获取二维码失败',
    imClickToRename: '点击重命名',
    imEnterGroupIdPlaceholder: '输入群ID',
    imPerGuildSettings: 'Guild 独立配置',
    imAesKeyLengthNotice: '需要为 32 个字符',
    imCurrentCharsNotice: '当前 {length} 个字符',
    imGuildSystemPrompt: '系统提示词',
    imGuildSystemPromptPlaceholder: '该 Guild 专属系统提示词（可选）',
    imEnterTelegramGroupIdPlaceholder: '输入 Telegram Group ID',

    // EmailSkillConfig AskAI Prompt
    emailTroubleshootPromptIntro: '我在配置邮件的 IMAP/SMTP 连接时遇到了问题，请帮我排查并给出解决方案。',
    emailTroubleshootPromptAccount: '邮箱账号：{account}',
    emailTroubleshootPromptAddress: '邮箱地址：{email}',
    emailTroubleshootPromptImapServer: 'IMAP 服务器：{host}:{port}',
    emailTroubleshootPromptSmtpServer: 'SMTP 服务器：{host}:{port}',
    emailTroubleshootPromptFailureHeader: '连接测试失败，错误信息如下：',
    emailTroubleshootPromptSuccessStatus: '成功',
    emailTroubleshootPromptFailStatus: '失败',
    emailTroubleshootPromptCheckItem: '- {label} 连接{status}：{message}（耗时 {durationMs}ms）',
  },
  en: {
    // ContentDistributionSettings
    contentDistHowToGetCredentials: 'How to obtain credentials:',
    contentDistStep1: 'Open and sign in to the YiXiaoEr client on your computer;',
    contentDistStep2: "Click 'CLI' in the left navigation sidebar;",
    contentDistStep3: "Copy 'API Key' and 'Client ID', paste them below, and click save.",
    contentDistDetecting: 'Checking...',
    contentDistApiKeyLabel: 'YiXiaoEr API Key',
    contentDistApiKeyPlaceholder: 'Enter your YiXiaoEr API Key',
    contentDistApiKeyHelp: 'Used for authentication. Resetting will invalidate the old token.',
    contentDistClientIdLabel: 'Local Client ID',
    contentDistClientIdPlaceholder: 'e.g., _9bvKq... (from YiXiaoEr client)',
    contentDistClientIdRecommendPrefix: 'Highly recommended: ',
    contentDistClientIdRecommendDesc: 'Tasks will be executed by your local client using your current network, avoiding account risk and disconnection.',

    // EmailSkillConfig
    emailTroubleshootPromptHeader: 'I encountered an issue configuring the email IMAP/SMTP connection. Please help me diagnose and resolve it.',
    emailTroubleshootAccount: 'Account: {account}',
    emailTroubleshootAddress: 'Email Address: {email}',
    emailTroubleshootImap: 'IMAP Server: {host}:{port}',

    // Agent settings & creation
    agentLevelSenior: 'Senior',
    agentLevelMiddle: 'Intermediate',
    agentLevelJunior: 'Junior',
    agentDeptOther: 'Other',

    // IM & Feishu/DingTalk
    imFetchQrCodeFailed: 'Failed to fetch QR code',
    imClickToRename: 'Click to rename',
    imEnterGroupIdPlaceholder: 'Enter Group ID',
    imPerGuildSettings: 'Per-Guild Settings',
    imAesKeyLengthNotice: 'must be 32 characters',
    imCurrentCharsNotice: 'currently {length} chars',
    imGuildSystemPrompt: 'System Prompt',
    imGuildSystemPromptPlaceholder: 'Custom system prompt for this guild (optional)',
    imEnterTelegramGroupIdPlaceholder: 'Enter Telegram Group ID',

    // EmailSkillConfig AskAI Prompt
    emailTroubleshootPromptIntro: 'I encountered an issue when configuring the IMAP/SMTP connection for my email. Please help diagnose and provide a solution.',
    emailTroubleshootPromptAccount: 'Account: {account}',
    emailTroubleshootPromptAddress: 'Email Address: {email}',
    emailTroubleshootPromptImapServer: 'IMAP Server: {host}:{port}',
    emailTroubleshootPromptSmtpServer: 'SMTP Server: {host}:{port}',
    emailTroubleshootPromptFailureHeader: 'Connection test failed with the following details:',
    emailTroubleshootPromptSuccessStatus: 'Success',
    emailTroubleshootPromptFailStatus: 'Failed',
    emailTroubleshootPromptCheckItem: '- {label} Connection {status}: {message} (elapsed {durationMs}ms)',
  },
};
