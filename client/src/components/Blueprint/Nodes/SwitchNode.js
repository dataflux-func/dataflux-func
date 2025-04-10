import { BaseNode, BaseNodeModel } from "./BaseNode";

import * as T from '@/toolkit';
import i18n from '@/i18n';

class SwitchNode extends BaseNode {
  setHtml(rootEl) {
    const { properties } = this.props.model;

    const el = document.createElement('div');
    el.className = 'node';
    const html = `
      <div class="node-icon"><i class="fa fa-fw fa-sitemap fa-rotate-270"></i></div>
      <div class="node-text">${properties.title || i18n.t('Switch')}</div>
    `;
    el.innerHTML = html;

    rootEl.innerHTML = '';
    rootEl.appendChild(el);
  }
}

class SwitchNodeModel extends BaseNodeModel {
  createId() {
    return T.genSimpleDataId('switch-node');
  }
}

export default {
  type : 'SwitchNode',
  view : SwitchNode,
  model: SwitchNodeModel,
};
