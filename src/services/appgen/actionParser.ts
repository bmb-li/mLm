export interface Action {
  type: 'read_file' | 'write_file' | 'delete_file' | 'list_files' | 'create_directory' | 'done'
  path?: string
  content?: string
}

const ACTION_RE = /\[ACTION:\s*(\w+)\]([\s\S]*?)\[\/ACTION\]/gi

export const parseActions = (text: string): Action[] => {
  const actions: Action[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(ACTION_RE.source, 'gi')
  while ((m = re.exec(text)) !== null) {
    const type = m[1].toLowerCase() as Action['type']
    const body = (m[2] || '').trim()
    if (type === 'done') {
      actions.push({ type: 'done' })
    } else if (type === 'list_files') {
      actions.push({ type: 'list_files' })
    } else if (type === 'read_file') {
      actions.push({ type: 'read_file', path: body })
    } else if (type === 'write_file') {
      const pathMatch = body.match(/^path:\s*(.+?)(?:\n|$)/)
      const contentMatch = body.match(/(?:^|\n)content:\s*([\s\S]*)$/)
      if (pathMatch) {
        actions.push({
          type: 'write_file',
          path: pathMatch[1].trim(),
          content: contentMatch ? contentMatch[1] : '',
        })
      }
    } else if (type === 'delete_file') {
      actions.push({ type: 'delete_file', path: body })
    } else if (type === 'create_directory') {
      actions.push({ type: 'create_directory', path: body })
    }
  }
  return actions
}

export const stripActionTags = (text: string): string => {
  return text.replace(ACTION_RE, '').trim()
}

export const hasAction = (text: string): boolean => {
  return ACTION_RE.test(text)
}
