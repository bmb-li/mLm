import RNBlobUtil from 'react-native-blob-util'

const PROJECTS_BASE = RNBlobUtil.fs.dirs.DocumentDir + '/LLMs/projects'

export interface ProjectMeta {
  id: string
  name: string
  mainFile: string
  createdAt: number
  updatedAt: number
  fileCount: number
}

export const ensureProjectsDir = async (): Promise<void> => {
  if (!(await RNBlobUtil.fs.exists(PROJECTS_BASE))) {
    await RNBlobUtil.fs.mkdir(PROJECTS_BASE)
  }
}

const projectDir = (id: string) => `${PROJECTS_BASE}/${id}`
const metaPath = (id: string) => `${projectDir(id)}/.meta.json`

const readMeta = async (id: string): Promise<ProjectMeta | null> => {
  try {
    const raw = await RNBlobUtil.fs.readFile(metaPath(id), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const writeMeta = async (id: string, meta: ProjectMeta): Promise<void> => {
  await RNBlobUtil.fs.writeFile(metaPath(id), JSON.stringify(meta), 'utf8')
}

export const createProject = async (
  name: string,
  mainFile: string = 'index.html',
  initialFiles?: Record<string, string>,
): Promise<ProjectMeta> => {
  await ensureProjectsDir()
  const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  await RNBlobUtil.fs.mkdir(projectDir(id))

  const meta: ProjectMeta = {
    id, name, mainFile,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    fileCount: 0,
  }

  if (initialFiles) {
    for (const [path, content] of Object.entries(initialFiles)) {
      const dir = path.substring(0, path.lastIndexOf('/'))
      if (dir) {
        const fullDir = `${projectDir(id)}/${dir}`
        if (!(await RNBlobUtil.fs.exists(fullDir))) {
          await RNBlobUtil.fs.mkdir(fullDir)
        }
      }
      await RNBlobUtil.fs.writeFile(`${projectDir(id)}/${path}`, content, 'utf8')
    }
    meta.fileCount = Object.keys(initialFiles).length
  }

  await writeMeta(id, meta)
  return meta
}

export const deleteProject = async (id: string): Promise<void> => {
  const dir = projectDir(id)
  if (await RNBlobUtil.fs.exists(dir)) {
    await RNBlobUtil.fs.unlink(dir)
  }
}

export const getProjectMeta = async (id: string): Promise<ProjectMeta | null> => {
  return readMeta(id)
}

export const updateProjectName = async (id: string, name: string): Promise<void> => {
  const meta = await readMeta(id)
  if (meta) {
    meta.name = name
    meta.updatedAt = Date.now()
    await writeMeta(id, meta)
  }
}

export const listProjects = async (): Promise<ProjectMeta[]> => {
  await ensureProjectsDir()
  const ids = await RNBlobUtil.fs.ls(PROJECTS_BASE)
  const metas: ProjectMeta[] = []
  for (const id of ids) {
    const meta = await readMeta(id)
    if (meta) metas.push(meta)
  }
  return metas.sort((a, b) => b.updatedAt - a.updatedAt)
}

export const readFile = async (projectId: string, filePath: string): Promise<string> => {
  const full = `${projectDir(projectId)}/${filePath}`
  return await RNBlobUtil.fs.readFile(full, 'utf8')
}

export const writeFile = async (projectId: string, filePath: string, content: string): Promise<void> => {
  const fullDir = `${projectDir(projectId)}/${filePath.substring(0, filePath.lastIndexOf('/'))}`
  if (filePath.includes('/') && !(await RNBlobUtil.fs.exists(fullDir))) {
    await RNBlobUtil.fs.mkdir(fullDir)
  }
  await RNBlobUtil.fs.writeFile(`${projectDir(projectId)}/${filePath}`, content, 'utf8')
  // Update meta
  const meta = await readMeta(projectId)
  if (meta) {
    meta.updatedAt = Date.now()
    meta.fileCount = (await listAllFiles(projectId)).length
    await writeMeta(projectId, meta)
  }
}

export const deleteFile = async (projectId: string, filePath: string): Promise<void> => {
  const full = `${projectDir(projectId)}/${filePath}`
  if (await RNBlobUtil.fs.exists(full)) {
    await RNBlobUtil.fs.unlink(full)
  }
  const meta = await readMeta(projectId)
  if (meta) {
    meta.updatedAt = Date.now()
    meta.fileCount = (await listAllFiles(projectId)).length
    await writeMeta(projectId, meta)
  }
}

export const createDirectory = async (projectId: string, dirPath: string): Promise<void> => {
  const full = `${projectDir(projectId)}/${dirPath}`
  if (!(await RNBlobUtil.fs.exists(full))) {
    await RNBlobUtil.fs.mkdir(full)
  }
}

const listAllFiles = async (projectId: string): Promise<string[]> => {
  const dir = projectDir(projectId)
  const results: string[] = []
  const walk = async (relativeDir: string) => {
    const entries = await RNBlobUtil.fs.ls(`${dir}/${relativeDir}`)
    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry}` : entry
      const fullPath = `${dir}/${relativePath}`
      const stat = await RNBlobUtil.fs.stat(fullPath)
      if (stat.type === 'directory') {
        await walk(relativePath)
      } else {
        results.push(relativePath)
      }
    }
  }
  await walk('')
  return results.filter(f => f !== '.meta.json')
}

export const listProjectFiles = async (projectId: string): Promise<string[]> => {
  return listAllFiles(projectId)
}

export const getProjectFileTree = async (projectId: string): Promise<string> => {
  const files = await listAllFiles(projectId)
  return files.join('\n')
}
