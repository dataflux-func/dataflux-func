function autoFormatJSON(ev) {
  var el = ev.target;

  // Auto format JSON
  if (el.type === 'textarea'&& el.classList.contains('body-param__text')) {
    try {
      el.value = JSON.stringify(JSON.parse(el.value), null, 2);
      el.classList.remove('bad-json-body');
    } catch(e) {
      el.classList.add('bad-json-body');
    }
  }
}

window.onload = function() {
  var vuexData = JSON.parse(localStorage.getItem('vuex')) || {};

  var virtualDir = location.pathname.split('/').slice(0, -2).join('/');
  var apiDocPath = `../api?lang=${vuexData.uiLocale || 'en'}`;
  if (virtualDir) apiDocPath += `&virtualDir=${virtualDir}`;

  //<editor-fold desc="Changeable Configuration Block">

  // the following lines will be replaced by docker/configurator, when it runs in a docker-container
  window.ui = SwaggerUIBundle({
    url: location.host === 'localhost:8081' ? 'http://localhost:8089' + apiDocPath : apiDocPath,
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    plugins: [
      SwaggerUIBundle.plugins.DownloadUrl
    ],
    layout: "StandaloneLayout",
    docExpansion: "none",
    displayRequestDuration: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
    requestInterceptor: (req) => {
      if (vuexData.xAuthToken) {
        req.headers['X-Dff-Auth-Token'] = vuexData.xAuthToken;
      }

      return req;
    },
    responseInterceptor: (resp) => {
      if (resp.status === 401) {
        console.warn('User not signed in, redirect to /');
        location.href = '../';
        return;
      }

      return resp;
    },
  });

  document.addEventListener('blur', autoFormatJSON, { capture: true });
  //</editor-fold>
};
