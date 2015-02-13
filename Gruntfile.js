module.exports = function(grunt) {
	
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-mocha-test');
	
	grunt.initConfig({
		
		// Mocha
		mochaTest: {
			test: {
				options: {
					reporter: 'spec'
				},
				src: ['./test/**/*.js']
			}
		},
		
		// JSHint
		jshint: {
			dist: ['./lib/**/*.js']
		}
		
	});

	grunt.registerTask('test', ['jshint', 'mochaTest']);
	
};