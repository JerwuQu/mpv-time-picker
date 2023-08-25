declare const mp: any;

namespace mpv {
  export interface OsdOverlay {
    data: string;
    update(): void;
    remove(): void;
  }

  export const createASS = (): OsdOverlay => mp.create_osd_overlay('ass-events');

  interface SubprocessResult {
    error_string: string;
    status: number;
    stdout: string;
    stderr: string;
  }

  export const runProcess = (args: string[], cb: (stdout?: string, error?: string) => void) => {
    mp.command_native_async(
      {
        name: 'subprocess',
        args,
        playback_only: false,
        capture_stdout: true,
        capture_stderr: true,
      },
      (_success: boolean, result: SubprocessResult) => {
        if (result.error_string) {
          cb(undefined, 'subprocess failed: ' + result.error_string);
        } else if (result.status !== 0) {
          cb(undefined, 'status code: ' + result.status + ', stderr: ' + result.stderr);
        } else {
          cb(result.stdout, undefined);
        }
      },
    );
  };
}

const hex = (n: number) => (n < 16 ? '0' + n.toString(16) : n.toString(16));
const endsWith = (str: string, needle: string) => str.substring(str.length - needle.length, str.length) === needle;

class AssDraw {
  // http://www.tcax.org/docs/ass-specs.htm
  overlay = mpv.createASS();
  colorStr = '';
  buf = '';
  destroy() {
    this.overlay.remove();
  }
  clear() {
    this.overlay.data = '';
    this.overlay.update();
  }
  setColor(r: number, g: number, b: number, a: number) {
    this.colorStr = `\\c&H${hex(b)}${hex(g)}${hex(r)}&\\1a&H${hex(255 - a)}&`;
  }
  start() {
    this.buf = '';
  }
  end() {
    this.overlay.data = this.buf;
    this.overlay.update();
    this.buf = '';
  }
  raw(txt: string) {
    this.buf += `{${this.colorStr}}${txt}\n`;
  }
  private part(str: string) {
    this.buf += `{\\bord0\\shad0\\pos(0,0)${this.colorStr}\\p1}${str}{\\p0}\n`;
  }
  rect(x: number, y: number, w: number, h: number) {
    this.part(`m ${x} ${y} l ${x + w} ${y} ${x + w} ${y + h} ${x} ${y + h}`);
  }
}

const overlay = new AssDraw();
const times: number[] = [];
const findClosestTime = (t: number) => times.reduce((a, v) => (Math.abs(v - t) < Math.abs(a - t) ? v : a), Infinity);

const secsToStr = (secs: number) => {
  secs = Math.round(secs);
  const s = secs % 60;
  const m = ((secs / 60) | 0) % 60;
  const h = (secs / 3600) | 0;
  return (h > 0 ? `${h}h` : '') + (m > 0 ? `${m}m` : '') + `${s}s`;
};

let lastUpdateOverlay = 0;
const updateOverlay = (rateLimit: boolean) => {
  if (rateLimit) {
    const t = mp.get_time();
    if (t - lastUpdateOverlay > 0.1) {
      lastUpdateOverlay = t;
    } else {
      return;
    }
  }

  if (!times.length) {
    overlay.clear();
    return;
  }
  times.sort((a, b) => a - b);

  const duration: number = mp.get_property_number('duration');
  const time: number = mp.get_property_number('playback-time');
  const baseRes = 720;
  const { aspect } = mp.get_osd_size();
  const width = aspect * baseRes;
  const barH = width / 300;
  const markerW = width / baseRes / 2;
  const markerH = barH * 2.5;
  const closestTime = findClosestTime(time);

  overlay.start();

  // Bar
  overlay.setColor(255, 255, 255, 100);
  if (times.length >= 2) {
    const startX = Math.floor((times[0] / duration) * width);
    const endX = Math.ceil((times[times.length - 1] / duration) * width);
    overlay.rect(0, 0, startX, barH);
    overlay.rect(endX, 0, width - endX, barH);
    overlay.setColor(255, 100, 100, 220);
    overlay.rect(startX, 0, endX - startX, barH);
  } else {
    overlay.rect(0, 0, width, barH);
  }

  // Time markers
  times.forEach((t) => {
    overlay.setColor(255, 100, 100, 255);
    overlay.rect((t / duration) * width - markerW, 0, markerW * 2, markerH + markerW / 2);
    if (t === closestTime) {
      overlay.setColor(50, 50, 150, 255);
    } else {
      overlay.setColor(0, 0, 0, 255);
    }
    overlay.rect((t / duration) * width - markerW / 2, 0, markerW, markerH);
  });

  // Current time
  overlay.setColor(255, 255, 255, 255);
  overlay.rect((time / duration) * width - markerW / 2, 0, markerW, markerH);

  // Time segment strings
  let total = 0;
  const str = times
    .map((t, i) => {
      let s = `${i + 1}: ${secsToStr(t)}`;
      if (i > 0) {
        const diff = t - times[i - 1];
        total += diff;
        s += ` (total: ${secsToStr(total)}`;
        if (i > 1) {
          s += `, diff: ${secsToStr(diff)}`;
        }
        s += ')';
      }
      return s;
    })
    .join('\\N');
  overlay.setColor(255, 255, 255, 255);
  overlay.raw(`{\\pos(10,10)\\fs16}${str}`);

  overlay.end();
};

const clearTimes = () => {
  times.splice(0, times.length);
  updateOverlay(false);
};

mp.add_key_binding('alt+t', 'mtp:pick', () => {
  const time = mp.get_property_number('time-pos');
  if (times.indexOf(time) >= 0) {
    mp.osd_message('time point already exists');
    return;
  }
  times.push(time);
  if (times.length === 1) {
    mp.set_property('keep-open', 'yes');
  }
  updateOverlay(false);
});

mp.add_key_binding('alt+T', 'mtp:remove', () => {
  const time = mp.get_property_number('time-pos');
  if (!times.length) {
    mp.osd_message('no time points');
    return;
  }
  const closestTime = findClosestTime(time);
  times.splice(times.indexOf(closestTime), 1);
  updateOverlay(false);
});

mp.register_script_message('mtp:run', (cmd: string, keepStr: string | undefined) => {
  if (!times.length) {
    mp.osd_message('no time points');
    return;
  }
  const path = mp.get_property('path');
  cmd = mp.utils.get_user_path(cmd);
  if (endsWith(cmd, '.js') || endsWith(cmd, '.lua')) {
    const id = mp.command_native(['load-script', cmd]).client_id;
    mp.command_native(['script-message-to', '@' + id, 'mtp:script:run', JSON.stringify({ path, times })]);
  } else {
    mpv.runProcess([cmd, path].concat(times.map((t) => t + '')), (stdout, error) => {
      if (error) {
        mp.msg.error(error);
        mp.osd_message('ERROR: ' + error, 3);
        return;
      }
      mp.msg.info(stdout);
      mp.osd_message(stdout, 3);
    });
  }

  if (keepStr?.toLowerCase() !== 'keep') {
    clearTimes();
  }
});

mp.register_event('file-loaded', clearTimes);
mp.observe_property('playback-time', 'number', () => updateOverlay(true));
