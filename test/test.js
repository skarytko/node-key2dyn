var fs = require('fs');
var assert = require('assert');
var Key2dyn = require('../lib/key2dyn');

var filename = './test/scripts/script.krs';
var filename2 = './test/scripts/cookies_script.krs';

describe('key2dyn', function() {
	
	var converter = new Key2dyn();
	
	describe('parse', function() {
		
		it('should return an parsed object from xml', function(done) {
			
			// open file
			fs.readFile(filename, { encoding: 'utf8' }, function(err, data) {
				if (err) throw err;

				// parse xml script
				converter.parseScript(data, function(err, result) {
					if (err) throw err;

					assert.equal(typeof result, 'object');
					done();
				});
			});
			
		});
		
	});
	
	describe('convert', function() {
		
		it('should return a converted script with cookies', function(done) {
			// open file
			fs.readFile(filename, { encoding: 'utf8' }, function(err, data) {
				if (err) throw err;

				// parse xml script
				converter.parseScript(data, function(err, result) {
					if (err) throw err;
					
					var script = converter.convertScript(result);
					
					fs.writeFile('./script.json', JSON.stringify(script), function (err, written, string) {
					  if (err) throw err;
						
						assert.equal(typeof script, 'object');
						done();
					});
					
				});
			});
		});
		
	});

});