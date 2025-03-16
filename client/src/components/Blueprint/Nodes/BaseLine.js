import { BezierEdge, BezierEdgeModel } from "@logicflow/core";

import * as T from '@/toolkit';

export class BaseLine extends BezierEdge {}
export class BaseLineModel extends BezierEdgeModel {
  createId() {
    return T.genSimpleDataId('line');
  }

  initEdgeData(data) {
    super.initEdgeData(data);

    this.text.draggable = false;
    this.text.editable  = false;
    this.isAnimation    = true;
  }

  getEdgeAnimationStyle() {
    const style = super.getEdgeAnimationStyle();

    style.stroke            = 'var(--border)';
    style.strokeDasharray   = '10 5';
    style.animationDuration = '200s';

    return style;
  }

  getTextStyle() {
    const style = super.getTextStyle();

    style.fontSize = 16;
    style.color    = 'var(--primary)';

    return style;
  }

  getData() {
    const data = super.getData();

    data.sourceAnchorId = this.sourceAnchorId;
    data.targetAnchorId = this.targetAnchorId;

    return data;
  }
}
