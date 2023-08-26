.PHONY: all
all: mpv-time-picker.js scripts/mtp-clip.js

%.js: %.ts
	tsc $^ --outFile $@

.PHONY: install clean
install: mpv-time-picker.js
	cp $^ ~/.config/mpv/scripts/

clean:
	rm -f mpv-time-picker.js scripts/*.js
