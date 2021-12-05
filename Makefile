PROJ=mpv-time-picker

$(PROJ).js: $(PROJ).ts
	tsc --lib es5 --removeComments --outFile $@ $^

.PHONY: install clean
install: $(PROJ).js
	cp $^ ~/.config/mpv/scripts/

clean:
	rm -f $(PROJ).js
