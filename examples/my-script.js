// Bound as: ctrl+g script-message mtp:run-script ~~/my-script.js
mp.register_script_message('mtp:script-handler', function (obj) {
  mp.msg.info('Script got some data: ' + obj);
  exit();
});
