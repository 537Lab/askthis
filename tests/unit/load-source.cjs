const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Exercise the real TypeScript modules; replace only OS/Electron boundaries.
exports.loadSource = function loadSource(entry, mocks = {}, globals = {}) {
  const root = path.resolve(__dirname, '../..')
  const cache = new Map()
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
    }).outputText
    const localRequire = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id]
      if (id.startsWith('.') || id.startsWith('@shared/')) {
        let target = id.startsWith('@shared/') ? path.join(root, 'src/shared', id.slice(8)) : path.resolve(path.dirname(filename), id)
        target = ['', '.ts', '.tsx', '.js'].map((ext) => target + ext).find((p) => fs.existsSync(p) && fs.statSync(p).isFile())
        if (!target) throw new Error(`Cannot resolve ${id} from ${filename}`)
        return load(target)
      }
      return require(id)
    }
    const context = vm.createContext({ module, exports: module.exports, require: localRequire, __dirname: path.dirname(filename), __filename: filename, console, process, Buffer, URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, ...globals })
    vm.runInContext(code, context, { filename })
    return module.exports
  }
  return load(path.join(root, entry))
}
