var fs = require('fs');
var assert = require('assert');
var key2dyn = require('../lib/key2dyn');

var filename = './test/scripts/script.krs';
var filename2 = './test/scripts/cookies_script.krs';

describe('key2dyn', function() {

	describe('parse', function() {
		
		it('should return an parsed object from xml', function(done) {
			
			// open file
			fs.readFile(filename, { encoding: 'utf8' }, function(err, data) {
				if (err) throw err;

				// parse xml script
				key2dyn.parseXMLScript(data, function(err, result) {
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
				key2dyn.parseXMLScript(data, function(err, result) {
					if (err) throw err;
					
					var script = key2dyn.convertScript(result);
					
					fs.writeFile('./tmp/script.json', JSON.stringify(script), function (err, written, string) {
					  if (err) throw err;
						
						assert.equal(typeof script, 'object');
						done();
					});
					
				});
			});
		});
		
	});

});