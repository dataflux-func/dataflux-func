import { BaseNode, BaseNodeModel } from "./BaseNode";

import * as T from '@/toolkit';

export class BaseHalfNode extends BaseNode {}

export class BaseHalfNodeModel extends BaseNodeModel {
  createId() {
    return T.genSimpleDataId('half-node');
  }

  setAttributes() {
    super.setAttributes();

    // Size
    this.width = 120;
    this.height = 40;
  }
}
