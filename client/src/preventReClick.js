export default {
  install(Vue) {
    Vue.directive('preventReClick', {
      inserted(el, binding) {
        el.addEventListener('click', () => {
          if (el.disabled)  return;

          el.disabled = true
          setTimeout(() => {
            el.disabled = false
          }, binding.value || 1000);
        });
      },

    });
  }
}
