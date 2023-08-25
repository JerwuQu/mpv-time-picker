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

function hex(n: number) {
  return n < 16 ? '0' + n.toString(16) : n.toString(16);
}

function secsToStr(secs: number) {
  const s = Math.round((100 * secs) % 6000) / 100;
  const m = ((secs / 60) | 0) % 60;
  const h = (secs / 3600) | 0;
  return (h > 0 ? `${h}h` : '') + (m > 0 ? `${m}m` : '') + `${s}s`;
}

class AssDraw {
  // http://www.tcax.org/docs/ass-specs.htm
  overlay = mpv.createASS();
  colorStr = '';
  buf = '';
  last_data = '';
  destroy() {
    this.overlay.remove();
  }
  update() {
    if (this.overlay.data !== this.last_data) {
      this.overlay.update();
      this.last_data = this.overlay.data;
    }
  }
  clear() {
    this.overlay.data = '';
    this.update();
  }
  setColor(r: number, g: number, b: number, a: number) {
    this.colorStr = `\\c&H${hex(b)}${hex(g)}${hex(r)}&\\1a&H${hex(255 - a)}&`;
  }
  start() {
    this.buf = '';
  }
  end() {
    this.overlay.data = this.buf;
    this.update();
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

class TimePicker {
  draw = new AssDraw();
  timestamps: number[] = [];
  lastOverlayUpdate = 0;

  constructor() {
    mp.add_key_binding('g', 'mtp:add', () => {
      const time = mp.get_property_number('time-pos');
      if (this.timestamps.indexOf(time) >= 0) {
        mp.osd_message('time point already exists');
        return;
      }
      this.timestamps.push(time);
      if (this.timestamps.length === 1) {
        mp.set_property('keep-open', 'yes');
      }
      this.updateOverlay();
    });

    mp.add_key_binding('G', 'mtp:remove', () => {
      const time = mp.get_property_number('time-pos');
      if (!this.timestamps.length) {
        mp.osd_message('no time points');
        return;
      }
      const closestTime = this.closestTime(time);
      this.timestamps.splice(this.timestamps.indexOf(closestTime), 1);
      this.updateOverlay();
    });

    mp.add_key_binding(undefined, 'mtp:clear', () => {
      this.clearTimes();
    });

    mp.register_script_message('mtp:run-command', (cmd: string, ...flags: string[]) => {
      cmd = mp.utils.get_user_path(cmd);
      this.runHandler(() => {
        const path = mp.get_property('path');
        mpv.runProcess([cmd, path].concat(this.timestamps.map((t) => t + '')), (stdout, error) => {
          if (error) {
            mp.msg.error(error);
            mp.osd_message('ERROR: ' + error, 3);
            return;
          }
          mp.msg.info(stdout);
          mp.osd_message(stdout, 3);
        });
      }, flags);
    });

    mp.register_script_message('mtp:run-script', (scriptPath: string, ...flags: string[]) => {
      scriptPath = mp.utils.get_user_path(scriptPath);
      this.runHandler(() => {
        const id = mp.command_native(['load-script', scriptPath]).client_id;
        mp.command_native(['script-message-to', '@' + id, 'mtp:script-handler', JSON.stringify(this.timestamps)]);
      }, flags);
    });

    mp.register_event('file-loaded', this.clearTimes.bind(this));
    mp.observe_property('playback-time', undefined, () => this.updateOverlay(true));
    mp.observe_property('video-params', undefined, () => this.updateOverlay());
    mp.observe_property('fullscreen', undefined, () => this.updateOverlay());
  }
  closestTime(t: number) {
    return this.timestamps.reduce((a, v) => (Math.abs(v - t) < Math.abs(a - t) ? v : a), Infinity);
  }
  clearTimes() {
    this.timestamps.splice(0, this.timestamps.length);
    this.updateOverlay();
  }
  runHandler(fn: () => void, flags: string[]) {
    if (!this.timestamps.length) {
      mp.osd_message('no time points');
      return;
    }

    fn();

    flags.forEach((f) => {
      switch (f.toLowerCase()) {
        case '+clear':
          this.clearTimes();
          break;
        default:
          mp.msg.error('Unknown flag: ' + f);
      }
    });
  }
  updateOverlay(rateLimit: boolean = false) {
    if (rateLimit) {
      const t = mp.get_time();
      if (t - this.lastOverlayUpdate > 0.1) {
        this.lastOverlayUpdate = t;
      } else {
        return;
      }
    }

    if (!this.timestamps.length) {
      this.draw.clear();
      return;
    }
    this.timestamps.sort((a, b) => a - b);

    const duration: number = mp.get_property_number('duration');
    const time: number = mp.get_property_number('playback-time');
    const baseRes = 720;
    const { aspect } = mp.get_osd_size();
    const width = aspect * baseRes;
    const barH = width / 200;
    const borderSz = width / 600;
    const tsMarkerW = width / 300;
    const tsMarkerH = barH * 1.5;
    const ctMarkerW = tsMarkerW / 2;
    const ctMarkerH = barH * 2.5;
    const closestTime = this.closestTime(time);

    this.draw.start();

    // Bar
    this.draw.setColor(255, 255, 255, 150);
    if (this.timestamps.length >= 2) {
      const startX = Math.floor((this.timestamps[0] / duration) * width);
      const endX = Math.ceil((this.timestamps[this.timestamps.length - 1] / duration) * width);
      this.draw.rect(0, 0, startX, barH);
      this.draw.rect(endX, 0, width - endX, barH);
      this.draw.setColor(255, 100, 100, 255);
      this.draw.rect(startX, 0, endX - startX, barH);
    } else {
      this.draw.rect(0, 0, width, barH);
    }

    const timeBlock = (t: number, w: number, h: number) => this.draw.rect((t / duration) * width - w / 2, 0, w, h);

    // Current time
    this.draw.setColor(100, 100, 255, 255);
    timeBlock(time, ctMarkerW + borderSz * 2, ctMarkerH + borderSz);
    this.draw.setColor(255, 255, 255, 255);
    timeBlock(time, ctMarkerW, ctMarkerH);

    // Time markers
    this.timestamps.forEach((t) => {
      this.draw.setColor(255, 100, 100, 255);
      timeBlock(t, borderSz, tsMarkerH + borderSz * 2);
      this.draw.setColor(255, 100, 100, 255);
      timeBlock(t, tsMarkerW + borderSz * 2, tsMarkerH + borderSz);
      this.draw.setColor(255, 255, 255, 255);
      timeBlock(t, tsMarkerW, tsMarkerH);
      if (t === closestTime) {
        this.draw.setColor(100, 100, 255, 255);
        timeBlock(t, borderSz, borderSz);
      }
    });

    // Time segment strings
    let total = 0;
    const timeStr = this.timestamps
      .map((t, i) => {
        let s = `#${i + 1}: ${secsToStr(t)}`;
        if (i > 0) {
          const diff = t - this.timestamps[i - 1];
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
    const header = `Timestamps (${this.timestamps.length}):`;
    this.draw.setColor(255, 255, 255, 255);
    this.draw.raw(`{\\bord1\\shad0\\pos(10,10)\\fs16}${header}\\N${timeStr}`);

    this.draw.end();
  }
}

new TimePicker();
