/*
 * The only script on opensheets.dev: copy-to-clipboard for the install
 * command. Progressive enhancement; without it the command is still plain
 * selectable text.
 */
(function () {
  var status = document.getElementById('copy-status');

  function selectText(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  Array.prototype.forEach.call(document.querySelectorAll('button[data-copy]'), function (btn) {
    var target = document.getElementById(btn.getAttribute('data-copy'));
    var label = btn.querySelector('.copy-label');
    if (!target || !label) return;
    var idle = label.textContent;
    var timer;

    function settle(copied) {
      btn.classList.toggle('is-copied', copied);
      label.textContent = copied ? 'Copied' : 'Select and copy';
      if (status) status.textContent = copied ? 'Install command copied to the clipboard.' : 'Clipboard unavailable; the command is selected.';
      clearTimeout(timer);
      timer = setTimeout(function () {
        btn.classList.remove('is-copied');
        label.textContent = idle;
      }, 1800);
    }

    btn.addEventListener('click', function () {
      var text = target.textContent.trim();
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { settle(true); }, function () { selectText(target); settle(false); });
      } else {
        selectText(target);
        settle(false);
      }
    });
  });
})();
