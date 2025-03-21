import { BaseNode, BaseNodeModel } from "./BaseNode";

import * as T from '@/toolkit';
import i18n from '@/i18n';

class BuiltinJSONNode extends BaseNode {
  setHtml(rootEl) {
    const { properties } = this.props.model;

    const el = document.createElement('div');
    el.className = 'node';

    let title = 'JSON';
    switch(properties.serializeOrDeserialize) {
      case 'serialize':
        title = 'Dump JSON';
        break;

      case 'deserialize':
        title = 'Load JSON';
        break;
    }

    const html = `
      <div class="node-icon"><i class="fa fa-fw fa-magic"></i></div>
      <div class="node-text">${i18n.t(title)}</div>
    `;
    el.innerHTML = html;

    rootEl.innerHTML = '';
    rootEl.appendChild(el);
  }
}

class BuiltinJSONNodeModel extends BaseNodeModel {
  createId() {
    return T.genSimpleDataId('builtin-json-node');
  }
}

export default {
  type : 'BuiltinJSONNode',
  view : BuiltinJSONNode,
  model: BuiltinJSONNodeModel,
};
