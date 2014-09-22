mocha				= ./node_modules/.bin/mocha
jshint			= ./node_modules/.bin/jshint
linelint 		= ./node_modules/.bin/linelint
lintspaces 	= ./node_modules/.bin/lintspaces

.PHONY : test

default: format

test:format
	$(mocha) -R spec ./test/

format:
	$(linelint) ./lib/*.js
	@echo "linelint pass!\n"
	$(lintspaces) -nt -i js-comments -d spaces -s 2 ./lib/*.js
	@echo "lintspaces pass!\n"
	$(jshint) ./lib/*.js
	@echo "JSHint pass!\n"
