#!/usr/bin/env node

var fs = require('fs');
var nearley = require('../lib/nearley.js');
var inlineRequire = require('../lib/inline-require.js');
var nomnom = require('nomnom');

var opts = nomnom
	.script('nearleyc')
	.option('file', {
		position: 0,
		help: "An input .ne file (if not provided then read from stdin)",
	})
	.option('out', {
		abbr: 'o',
		help: "File to output to (defaults to stdout)",
	})
	.option('export', {
		abbr: 'e',
		help: "Variable to set the parser to",
		default: "module.exports"
	})
	.option('version', {
		abbr: '-v',
		flag: true,
		help: "Print version and exit",
		callback: function() {
			return require('../package.json').version;
		}
	})
	.parse();

function Compile(structure) {
	var un = 0;
	function unique() {
		return "  id" + (++un);
	}

	var outputRules = [];

	function stringifyProductionRule(name, rule) {
		var tokenList = [];

		rule.tokens.forEach(function(token) {
			if (token.type && token.type === 'literal') {
				var str = token.data;
				if (str.length > 1) {
					var rules = str.split("").map(function(d) {
						return {type: 'literal', 'data':d};
					});
					var postprocessor = "function(d) {return d.join('');}";

					var newname = unique();
					stringifyProductionRule(newname, {tokens: rules, postprocessor: postprocessor});
					tokenList.push(JSON.stringify(newname));
				} else if (str.length === 1) {
					tokenList.push(JSON.stringify({ literal: str}));
				}
			} else if (typeof(token) === 'string') {
				if (token !== 'null') tokenList.push(JSON.stringify(token));
            } else if (token instanceof RegExp) {
                tokenList.push(token.toString());
			} else {
                throw new Error("Should never get here");
            }
		})

		tokenList = "[" + tokenList.join(", ") + "]";
		var out = "rules.push(nearley.rule(" + JSON.stringify(name) + ", " + tokenList +
			(rule.postprocessor ? ", " + rule.postprocessor : "") + "));";

		outputRules.push(out);
	}

	structure.forEach(function(productionRule) {
		var rules = productionRule.rules;

		rules.forEach(function(rule) {
			stringifyProductionRule(productionRule.name, rule);
		});
	});


	var output = "";
	var ws = "\n    ";

	output += "// Generated automatically by nearley.\n";
	output += opts.export + " = function() {";

	output += ws + "var nearley = " + inlineRequire(require, '../lib/nearley.js');
	output += ws + "var rules = [];";
	output += ws + "var id = function(a){return a[0];};";
	output += ws;
	output += ws + outputRules.join("\n    ");
	output += ws;
	output += ws + "return new nearley.Parser(rules, " + JSON.stringify(structure[0].name) + ");";

	output += "\n};";

	return output;
}

var input = opts.file ? fs.createReadStream(opts.file) : process.stdin;
var language = require('../lib/nearley-language.js');
var parser = new nearley.Parser(language.rules, language.start);

input
	.on('data', function(d) {
		parser.feed(d.toString());
	})
	.on('end', function() {
		var c = Compile(parser.results[0]);
		if (!opts.out) {
	        process.stdout.write(c);
	    } else {
	        fs.writeFile(opts.out, c);
	    }
	});
