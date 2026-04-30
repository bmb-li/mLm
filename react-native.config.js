const path = require('path')
const pak = require('./modules/llama.rn/package.json')

module.exports = {
  dependencies: {
    [pak.name]: {
      root: path.join(__dirname, 'modules/llama.rn'),
    },
  },
}
