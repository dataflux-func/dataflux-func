// Acknowledgements
let MARKER = '%c';
let THANKS_HEADER = '# Acknowledgements / 鸣谢';
let THANKS_HEADER_CSS = 'font-size: 18px; color: #F60';

let THANKS_LIST = [
  {
    name: 'samuel',
    desc: '提出了整个 idea，并设计了 @DFF.API 的核心使用方式',
  },
  {
    name: '陆宏鸣',
    desc: '初期提供了大量技术实现方面的帮助',
  },
  {
    name: 'sx、陈春亮、郁凯、刘星',
    desc: '首个投产项目的先行团队',
  },
  {
    name: '范育宾',
    desc: '在迭代、相关项目落地过程中，提供了大量意见反馈，帮助完善了整个系统',
  },
  {
    name: '张斌',
    desc: '贡献了 Golang 版本的 SDK',
  },
  {
    name: '李文津',
    desc: '帮助实现了 Helm 的部署方式，为 k8s 用户提供了方便',
  }
];
let THANKS_LISTE_CSS = 'font-weight: bold';

export function thanks() {
  console.log(`${MARKER} ${THANKS_HEADER}`, THANKS_HEADER_CSS);
  THANKS_LIST.forEach(d => {
    console.log(`${MARKER}- ${d.name}: ${d.desc}`, THANKS_LISTE_CSS);
  });
}
