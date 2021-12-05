declare const mp: any;

namespace mpv {
	export interface OsdOverlay {
		data: string
		update(): void
		remove(): void
	}

	export const createASS = (): OsdOverlay => mp.create_osd_overlay('ass-events');
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
	sidedTriangle(x: number, y: number, w: number, h: number) {
		this.part(`m ${x} ${y} l ${x + w} ${y + h / 2} ${x} ${y + h}`);
	}
	centeredDiamond(x: number, y: number, w: number, h: number) {
		this.part(`m ${x} ${y - h / 2} l ${x + w / 2} ${y} ${x} ${y + h / 2} ${x - w / 2} ${y}`);
	}
}


const overlay = new AssDraw();
const times: number[] = [];

const updateOverlay = () => {
	if (!times.length) {
		overlay.clear();
		return;
	}
	times.sort((a, b) => a - b);

	const duration: number = mp.get_property_number('duration');
	const {width} = mp.get_osd_size(); // TODO: handle resize
	const barH = width / 60;

	overlay.start();
	overlay.setColor(100, 100, 100, 100);
	overlay.rect(0, 0, width, barH);
	let diamondTimes = times;
	if (times.length >= 2) {
		diamondTimes = times.slice(1, times.length - 1);
		const startX = times[0] / duration * width;
		const endX = times[times.length - 1] / duration * width;
		overlay.setColor(255, 255, 255, 200);
		overlay.rect(startX, (barH - barH / 5) / 2, endX - startX, barH / 5);
		overlay.setColor(200, 255, 200, 255);
		overlay.sidedTriangle(startX, 0, -barH / 3, barH);
		overlay.sidedTriangle(endX, 0, barH / 3, barH);
	}
	overlay.setColor(200, 200, 255, 255);
	diamondTimes.forEach(time => {
		overlay.centeredDiamond(time / duration * width, barH / 2, barH / 2, barH * 0.9);
	});
	overlay.end();
};
const clearTimes = () => {
	times.splice(0, times.length);
	updateOverlay();
};

mp.add_key_binding('alt+t', 'mtp:pick', () => {
	const time = mp.get_property_number('time-pos');
	const f = times.indexOf(time);
	if (f >= 0) {
		times.splice(f, 1);
	} else {
		times.push(time);
	}
	updateOverlay();
});
mp.register_script_message('mtp:run', (cmd: string) => {
	// TODO
	clearTimes();
});

mp.register_event('file-loaded', clearTimes);
