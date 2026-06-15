import RNBlobUtil from 'react-native-blob-util'

const LOG_FILE = RNBlobUtil.fs.dirs.DocumentDir + '/LLMs/appgen.log'

let initialized = false

const init = async () => {
  if (initialized) return
  initialized = true
  try {
    const dir = RNBlobUtil.fs.dirs.DocumentDir + '/LLMs'
    if (!(await RNBlobUtil.fs.exists(dir))) await RNBlobUtil.fs.mkdir(dir)
  } catch {}
}

export const log = async (...args: any[]): Promise<void> => {
  try {
    await init()
    const line = `[${new Date().toISOString()}] ${args.map(a =>
      typeof a === 'object' ? JSON.stringify(a) : String(a),
    ).join(' ')}\n`
    const exists = await RNBlobUtil.fs.exists(LOG_FILE)
    if (exists) {
      await RNBlobUtil.fs.appendFile(LOG_FILE, line, 'utf8')
    } else {
      await RNBlobUtil.fs.writeFile(LOG_FILE, line, 'utf8')
    }
  } catch {}
}
