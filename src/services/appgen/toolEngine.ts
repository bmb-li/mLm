import * as projectStorage from './projectStorage'

interface ToolCall {
  id: string
  function: {
    name: string
    arguments: string
  }
}

export interface ToolResult {
  tool_call_id: string
  role: 'tool'
  content: string
}

export type TodoEvent =
  | { type: 'create'; items: string[] }
  | { type: 'update'; id: string; status: string; details?: string }

const genId = () => 'call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)

export const executeToolCall = async (
  toolCall: ToolCall,
  projectId: string,
  onTodoEvent?: (event: TodoEvent) => void,
): Promise<ToolResult> => {
  const toolCallId = toolCall.id || genId()
  const name = toolCall.function.name
  let args: any
  try {
    args = JSON.parse(toolCall.function.arguments)
  } catch {
    return {
      tool_call_id: toolCallId,
      role: 'tool',
      content: `Error: invalid JSON arguments: ${toolCall.function.arguments}`,
    }
  }

  try {
    let result: string
    switch (name) {
      case 'read_file': {
        const content = await projectStorage.readFile(projectId, args.path)
        const lines = content.split('\n')
        result = lines.map((line, i) => `${i + 1}: ${line}`).join('\n')
        break
      }
      case 'write_file': {
        await projectStorage.writeFile(projectId, args.path, args.content)
        result = `File written: ${args.path}`
        break
      }
      case 'delete_file': {
        await projectStorage.deleteFile(projectId, args.path)
        result = `File deleted: ${args.path}`
        break
      }
      case 'list_files': {
        const files = await projectStorage.listProjectFiles(projectId)
        result = files.length > 0 ? files.join('\n') : '(empty)'
        break
      }
      case 'create_directory': {
        await projectStorage.createDirectory(projectId, args.path)
        result = `Directory created: ${args.path}`
        break
      }
      case 'create_todo_list': {
        if (onTodoEvent) onTodoEvent({ type: 'create', items: args.items || [] })
        result = `Plan created with ${(args.items || []).length} items`
        break
      }
      case 'update_todo': {
        if (onTodoEvent) onTodoEvent({ type: 'update', id: args.id, status: args.status, details: args.details })
        result = `Todo ${args.id} updated to ${args.status}`
        break
      }
      default:
        result = `Unknown tool: ${name}`
    }
    return { tool_call_id: toolCallId, role: 'tool', content: result }
  } catch (e: any) {
    return {
      tool_call_id: toolCallId,
      role: 'tool',
      content: `Error executing ${name}: ${e.message || e}`,
    }
  }
}

export const executeToolCalls = async (
  toolCalls: ToolCall[],
  projectId: string,
  onTodoEvent?: (event: TodoEvent) => void,
): Promise<ToolResult[]> => {
  const results: ToolResult[] = []
  for (const tc of toolCalls) {
    const r = await executeToolCall(tc, projectId, onTodoEvent)
    results.push(r)
  }
  return results
}
