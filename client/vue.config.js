const os     = require('os');
const fs     = require('fs');
const path   = require('path');
const cssmin = require('cssmin');

const IS_PROD = process.env.NODE_ENV == 'production';

const CSS_META = {
  'element'          : false,
  'site'             : false,
  'code-mirror-theme': true,

  'site-theme.enterprise': true,
  'site-theme.classic'   : true,
  'site-theme.miku'      : true,
}
for (let name in CSS_META) {
  let isTheme = CSS_META[name];

  if (isTheme) {
    var cssThemeLight = fs.readFileSync(path.join(__dirname, `./public/${name}.light.css`));
    var cssThemeDark  = fs.readFileSync(path.join(__dirname, `./public/${name}.dark.css`));
    fs.writeFileSync(path.join(__dirname, `./public/${name}.light.min.css`), cssmin(cssThemeLight.toString()));
    fs.writeFileSync(path.join(__dirname, `./public/${name}.dark.min.css`),  cssmin(cssThemeDark.toString()));

    var cssThemeAuto = `@media (prefers-color-scheme: light) { ${cssThemeLight} } @media (prefers-color-scheme: dark) { ${cssThemeDark} }`;
    fs.writeFileSync(path.join(__dirname, `./public/${name}.auto.css`), cssThemeAuto);
    fs.writeFileSync(path.join(__dirname, `./public/${name}.auto.min.css`),  cssmin(cssThemeAuto.toString()));

  } else {
    var css = fs.readFileSync(path.join(__dirname, `./public/${name}.css`));
    fs.writeFileSync(path.join(__dirname, `./public/${name}.min.css`), cssmin(css.toString()));
  }
}

module.exports = {
  publicPath: IS_PROD ? '../client-app/' : '/',
  productionSourceMap: false,
  chainWebpack: config => {
    config.module.rule('vue')
      .use('vue-loader')
        .loader('vue-loader')
        .tap(options => {
          options.compilerOptions.whitespace = 'preserve';
          return options;
        })
        .end();
    config.module.rule('i18n')
      .resourceQuery(/blockType=i18n/)
      .type('javascript/auto')
      .use('i18n')
        .loader('@intlify/vue-i18n-loader')
        .end();
    config.module.rule('yaml')
      .test(/\.ya?ml$/)
      .include.add(path.resolve(__dirname, './src/assets/yaml'))
      .end()
      .type('json')
      .use('yaml-loader')
        .loader('yaml-loader')
        .tap(options => {
          options = options || {};
          options.asJSON = true;
          return options;
        })
        .end()
  },
  devServer: {
    host: '0.0.0.0',
    port: 8081,
    disableHostCheck: true,
  },
}
