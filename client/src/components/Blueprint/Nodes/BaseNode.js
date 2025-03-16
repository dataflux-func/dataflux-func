import { HtmlNode, HtmlNodeModel } from "@logicflow/core";

import * as T from '@/toolkit';

import i18n from '@/i18n';

export class BaseNode extends HtmlNode {}

export class BaseNodeModel extends HtmlNodeModel {
  createId() {
    return T.genSimpleDataId('node');
  }

  setAttributes() {
    super.setAttributes();

    this.width = 220;
    this.height = 40;

    this.text.draggable = false;
    this.text.editable = false;

    // Avoid pointing to Entry node
    this.sourceRules.push({
      message: i18n.t('Cannot point to the Entry Node'),
      validate: (sourceNode, targetNode, sourceAnchor, targetAnchor) => {
        return targetNode.type !== 'EntryNode';
      },
    });

    // Avoid pointing to node itself
    this.sourceRules.push({
      message: i18n.t('Cannot point to the node itself'),
      validate: (sourceNode, targetNode, sourceAnchor, targetAnchor) => {
        let isSelf = sourceNode.id === targetNode.id;

        if (isSelf) return false;
        return true;
      },
    });
  }
}
