export const FILE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取项目中的文件内容。返回文件的文本内容。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件相对路径，如 "index.html"、 "style.css"、 "components/header.html"' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件内容。如果文件不存在则创建，存在则覆盖。会递归创建需要的子目录。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件相对路径' },
          content: { type: 'string', description: '完整的文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: '删除项目中的文件。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件相对路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出项目中的所有文件（递归），返回每行一个相对路径的列表。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: '在项目中创建一个子目录。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录相对路径，如 "components"、"assets/images"' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_todo_list',
      description: '创建项目计划。在执行任何文件操作前调用此工具来规划你的任务。每条代表一个待办项。',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            description: '待办项列表，每项描述一个任务，如 ["创建 index.html - 主页面结构", "创建 style.css - 样式设计"]',
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_todo',
      description: '更新代办事项的状态。当你开始处理或完成一个任务时调用。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '待办项 ID，对应 create_todo_list 返回的序号，如 "1"、"2"' },
          status: { type: 'string', enum: ['running', 'done', 'failed'], description: 'running=开始执行, done=完成, failed=失败' },
          details: { type: 'string', description: '可选的执行详情' },
        },
        required: ['id', 'status'],
      },
    },
  },
]
