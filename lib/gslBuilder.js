var _ = require('underscore');
var xml2js = require('xml2js');
var xmlBuilder = new xml2js.Builder();
var xmlParser = xml2js.parseString;

module.exports = function(script) {

	// build base script
	var xml = {
		Transaction: {
			'$': {
				name: script.name,
				doObjectDownloads: true,
				doPageSummary: false
			},
			Configuration: {
				Param: []
			},
			PageRequest: []
		}
	};
	
	// Add configurations
	xml.Transaction.Configuration.Param = _.map(script.configurations, function(config) {
		return { '$': { name: config.name, value: config.value } };
	});
	
	// Add additional configurations
	xml.Transaction.Configuration.Param.push({ '$': { name: 'http://www.gomez.com/settings/ip_mode', value: 'IPv6_preferred'} });
	
	// Add steps
	xml.Transaction.PageRequest = _.map(script.steps, function(step) {
		var b = new Buffer(JSON.stringify(step.actions));

		var param = {
			'$': {
				url: step.url,
				displayName: step.description,
				method: 'GET',
				post_script: b.toString('base64')
			}
		};
		
		return param;
	});
	
	// convert to xml;
	return xmlBuilder.buildObject(xml);
};