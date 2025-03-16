import { BaseLine, BaseLineModel } from "./BaseLine";

import * as T from '@/toolkit';

class SwitchLine extends BaseLine {}
class SwitchLineModel extends BaseLineModel {
  createId() {
    return T.genSimpleDataId('switch-line');
  }

  setAttributes() {
    super.setAttributes();

    // Display branch order as text
    let _switchOrder = this.getProperties().switchOrder;
    if (T.notNothing(_switchOrder)) {
      this.updateText(` #${_switchOrder} `);
    }
  }

  getTextStyle() {
    const style = super.getTextStyle();

    style.color = 'var(--primary)';
    style.fontSize = 16;
    style.style = 'font-family: Iosevka; cursor: hand;';
    style.background.fill = 'var(--primary-faded)';
    style.background.stroke = 'var(--primary)';
    style.background.rx = 5;
    style.background.ry = 5;
    style.background.style = 'cursor: hand;';

    return style;
  }

  getEdgeAnimationStyle() {
    const style = super.getEdgeAnimationStyle();

    style.stroke            = 'var(--primary)';
    style.strokeDasharray   = '10 5';
    style.animationDuration = '200s';

    return style;
  }
}

export default {
  type : 'SwitchLine',
  view : SwitchLine,
  model: SwitchLineModel,
};
