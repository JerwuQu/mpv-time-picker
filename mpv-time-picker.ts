declare const mp: any;

namespace mpv {
	export interface OsdOverlay {
		data: string
		update(): void
		remove(): void
	}

	export const createASS = (): OsdOverlay => mp.create_osd_overlay('ass-events');

	interface SubprocessResult {
		error_string: string
		status: number
		stdout: string
		stderr: string
	}

	export const runProcess = (args: string[], cb: (stdout?: string, error?: string) => void) => {
		mp.command_native_async({
			name: 'subprocess',
			args,
			playback_only: false,
			capture_stdout: true,
			capture_stderr: true,
		}, (_success: boolean, result: SubprocessResult) => {
			if (result.error_string) {
				cb(null, 'subprocess failed: ' + result.error_string);
			} else if (result.status !== 0) {
				cb(null, 'status code: ' + result.status + ', stderr: ' + result.stderr);
			} else {
				cb(result.stdout, null);
			}
		});
	};
}

const hex = (n: number) => n < 16 ? '0' + n.toString(16) : n.toString(16);

class AssDraw {
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
	private part(str: string) {
		this.buf += `{\\bord0\\shad0\\pos(0,0)${this.colorStr}\\p1}${str}{\\p0}\n`;
	}
	rect(x: number, y: number, w: number, h: number) {
		this.part(`m ${x} ${y} l ${x + w} ${y} ${x + w} ${y + h} ${x} ${y + h}`);
	}
}

const overlay = new AssDraw();
const times: number[] = [];

const updateOverlay = () => {
	if (!times.length) {
		overlay.clear();
	}
	times.sort((a, b) => a - b);

	const duration: number = mp.get_property_number('duration');
	const baseRes = 720;
	const {aspect} = mp.get_osd_size();
	const width = aspect * baseRes;
	const barH = width / 200;
	const markerW = width / baseRes;
	const markerH = barH * 1.5;

	overlay.start();
	if (times.length >= 2) {
		const startX = Math.floor(times[0] / duration * width);
		const endX = Math.ceil(times[times.length - 1] / duration * width);
		overlay.setColor(255, 255, 255, 100);
		overlay.rect(0, 0, startX, barH);
		overlay.rect(endX, 0, width - endX, barH);
		overlay.setColor(255, 255, 255, 220);
		overlay.rect(startX, 0, endX - startX, barH);
	} else {
		overlay.setColor(255, 255, 255, 150);
		overlay.rect(0, 0, width, barH);
	}
	times.forEach(time => {
		overlay.setColor(0, 0, 0, 255);
		overlay.rect(time / duration * width - markerW / 2, 0, markerW, markerH / 2);
		overlay.setColor(255, 100, 100, 255);
		overlay.rect(time / duration * width - markerW / 2, markerH / 2, markerW, markerH / 2);
	});
	// TODO: list length of each segment (along with total)
	overlay.end();
};

const clearTimes = () => {
	times.splice(0, times.length);
	updateOverlay();
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
	updateOverlay();
});

mp.add_key_binding('alt+T', 'mtp:remove', () => {
	const time = mp.get_property_number('time-pos');
	if (!times.length) {
		mp.osd_message('no time points');
		return;
	}
	const closest = times.reduce((a, v) => Math.abs(v - time) < Math.abs(a -time) ? v : a, Infinity);
	times.splice(times.indexOf(closest), 1);
	updateOverlay();
});

mp.register_script_message('mtp:run', (cmd: string, keepStr: string | undefined) => {
	if (!times.length) {
		mp.osd_message('no time points');
		return;
	}
	const path = mp.get_property('path');
	cmd = mp.utils.get_user_path(cmd);
	mpv.runProcess([cmd, path].concat(times.map(t => t + '')), (stdout, error) => {
		if (error) {
			mp.msg.error(error);
			mp.osd_message('ERROR: ' + error, 3);
			return;
		}
		mp.msg.info(stdout);
		mp.osd_message(stdout, 3);
	});

	if (keepStr?.toLowerCase() !== 'keep') {
		clearTimes();
	}
});

mp.register_event('file-loaded', clearTimes);
