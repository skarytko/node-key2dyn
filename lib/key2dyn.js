var _ = require('underscore');
var xml2js = require('xml2js');

var _xmlParser = xml2js.parseString;
var _xmlBuilder = new xml2js.Builder();

var key2dyn = module.exports = {};

/**
 * Parses Keynote script XML string to object.
 * 
 * @this {Converter}
 * @param {string} Keynote script XML string.
 * @callback 
 * @return {object} XML Parser object.
 */
key2dyn.parseXMLScript = function(xmlScript, callback) {
	callback = (typeof callback === 'function') ? callback : function() {};
	
	return _xmlParser(xmlScript, { explicitArray: false, mergeAttrs: true }, function(err, result) {
		if (err) callback(err);
	
		var scriptObj = result.script || {};
	
		callback(null, scriptObj);
	});
};

/**
 * Converts Keynote script into Dynatrace (Gomez) script.
 * 
 * @param {object}  Keynote script
 * @return {object} The script object.
 */
key2dyn.convertScript = function(keynoteScript) {
	var script = {};
	
	script = _setScriptDefaults(script);

	// parse script name
	script.name = _cdataReplace(keynoteScript.name) || _cdataReplace(keynoteScript.description);

	// parse script steps
	if (keynoteScript.actions && keynoteScript.actions.action) {
		script.steps = _steps(keynoteScript.actions.action);
	}
	
	// parse cookies
	if (keynoteScript.cookies && keynoteScript.cookies.cookie) {
		var cookies = _cookies(keynoteScript.cookies.cookie);
		
		if (!script.steps[0]) {
			script.steps[0] = { actions: [] };
		}

		script.steps[0].actions = cookies.concat(script.steps[0].actions);
	}
	
	// parse hosts
	if (keynoteScript.hosts && keynoteScript.hosts.host) script.dns = _dns(keynoteScript.hosts.host);

	return script;
};

key2dyn.gslify = function(script) {
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
				url: step.url || 'http://www.gomez.com/flush',
				displayName: step.description,
				method: 'GET',
				post_script: b.toString('base64')
			}
		};
		
		return param;
	});
	
	// convert to xml;
	return _xmlBuilder.buildObject(xml);
};

var _setScriptDefaults = function(script) {
	script.clientCerts = [];
  script.configurations = [
		{ name: "http://www.gomez.com/settings/gsl_version", value: "2"},
		{ name: "http://www.gomez.com/settings/browser_version", value: "IE10" }
  ];
	script.steps = [];
	script.dns = [];
  script.enableFlash = false;
  script.enableForMobile = false;
  script.headers = [];
  script.ipMode = 'IPv6_preferred';
  script.parameters = [];
	
	return script;
};

/**
 * Utility function to replace bad characters resulting from CDATA headers.
 * 
 * @this {Converter}
 * @param {string}  The input string.
 * @return {string} The replaced string.
 */
var _cdataReplace = function(string) {
	if (string) {
		return string.replace(/\t|\r|\n/g, '');
	} else {
		return '';
	}
};

/**
 * Parses query string from Keynote Query object.
 * 
 * @this {Converter}
 * @param {object} kQuery - The Keynote Query object.
 * @return {string} The query string.
 */
var _queryString = function(kQuery) {
	var qs = [];
	
	if (!_.isArray(kQuery)) kQuery = [kQuery];
	
	kQuery.forEach(function(query) {
		var q = ['', ''];
		
		_.each(query.parameter, function(param) {
			if (param.name === 'Name') q[0] = _cdataReplace(param.variable._) || '';
			if (param.name === 'Value') q[1] = _cdataReplace(param.variable._) || '';
		});

		qs.push(q.join('='));
	});

	return qs.join('&');
};

var _dns = function(hosts) {
	var dns = [];

	if (!_.isArray(hosts)) hosts = [hosts];
	
	dns = _.map(hosts, function(host) {
		var entry = {
			host: host.name
		};

		// get navigate url
		if (host.parameter) {
			if (!_.isArray(host.parameter)) host.parameter = [host.parameter];
		
			_.each(host.parameter, function(param) {
				if (param.name === 'ipaddress') {
					entry.mapTo = 'ip';
					entry.dest1 = _cdataReplace(param.variable._);
				}
			});
		}

		return entry;
	});

	return dns;
};
	
var _steps = function(actions) {
	var steps = [];
	
	if (!_.isArray(actions)) actions = [actions];
	
	// each step (Keynote actions = step)
	_.each(actions, function(action) {
		var step = {};
		
		// parse step description
		step.description = _cdataReplace(action.name) || _cdataReplace(action.description);
		
		step.actions = [];
		
		// parse actions
		if (action.step) {
			step.actions = _actions(action.step);
		}
		
		// parse waits
		if (action.completion || action.type != 'Browser') {
			step.actions.push(_waitAction('page_complete'));
		}

		// parse validations
		if (action.validation && action.validation.validate) {
			var validates = _validates(action.validation.validate);
			
			// merge validates at end of step
			step.actions = step.actions.concat(validates);
		}

		steps.push(step);
	});
	
	return steps;
};

var _actions = function(steps) {
	var actions = [];
	
	if (!_.isArray(steps)) steps = [steps];

	// each action
	_.each(steps, function(step) {
		var action = {};

		switch(step.type) {
		case 'Navigate':
			action = _navigateAction(step);
			break;
		case 'Click':
			action = _clickAction(step);
			break;
		case 'Text':
			action = _formFillAction(step);
			break;
		case 'Select':
			action = _selectAction(step);
			break;
		case 'Script':
			action = _customAction(step);
			break;
		}
/*
		if (step.type === 'Navigate') {
			// Check if HTTP Auth
			if (kStep.authentication && kStep.authentication.parameter) {
			
				if (!_.isArray(kStep.authentication.parameter)) kStep.authentication.parameter = [kStep.authentication.parameter];
			
				kStep.authentication.parameter.forEach(function(param) {
				
					if (param.name === 'Username') step.httpUser = self._cdataReplace(param.variable._);
					if (param.name === 'Password') step.httpPassword = self._cdataReplace(param.variable._);
				});
			}
*/	
		actions.push(action);
	});
	
	return actions;
};

var _validates = function(validates) {
	var actions = [];
	
	if (!_.isArray(validates)) validates = [validates];
	
	_.each(validates, function(validate) {
		var action = _validateAction(validate);
		
		actions.push(action);
	});
	
	return actions;
};

var _cookies = function(cookies) {
	var actions = [];
	
	if (!_.isArray(cookies)) cookies = [cookies];
	
	_.each(cookies, function(cookie) {
		var action = _cookieAction(cookie);
		
		actions.push(action);
	});
	
	return actions;
};

var _cookieAction = function(cookie) {
	var action = { type: 'setCookie' };
	
	action.url = (cookie.secure > 0) ? 'https://' : 'http://';
	
	if (cookie.parameter) {
		if (!_.isArray(cookie.parameter)) cookie.parameter = [cookie.parameter];
		
		_.each(cookie.parameter, function(param) {
			if (param.name === 'Name') action.name = _cdataReplace(param.variable._);
			if (param.name === 'Value') action.value = _cdataReplace(param.variable._);
			if (param.name === 'Domain') action.url += _cdataReplace(param.variable._);
			if (param.name === 'Path') action.url += _cdataReplace(param.variable._);
		});
	}
	
	return action;
};

var _waitAction = function(criteria) {
	var action = {
		type: 'wait',
		criteria: criteria || 'network'
	};
	
	return action;
};

var _navigateAction = function(step) {
	var action = { 
		type: 'navigate',
		url: ''
	};
	
	// get navigate url
	if (step.parameter) {
		if (!_.isArray(step.parameter)) step.parameter = [step.parameter];
		
		_.each(step.parameter, function(param) {
			if (param.name === 'URL') action.url = _cdataReplace(param.variable._);
		});
	}
	
	// get target window
	if (step.context) {
		var targetWindow = 'gomez_top[' + (step.context.window || 0) + ']';
		
		if (parseInt(step.context.frame) > 0) targetWindow = targetWindow + '.frames[' + step.context.frame + ']';
		
		action.targetWindow = targetWindow;
	}
	
	// build query string
	if (step.query) {
		action.url = action.url + '?' + _queryString(step.query);
	}
	
	return action;
};

/**
 * Creates Validate Action from Keynote Validation object.
 * 
 * @this {Converter}
 * @param {object} kValidation - The Keynote Validation object.
 * @return {object} The Validate object.
 */
var _validateAction = function(validation) {
	validation = validation || {};
	
	// Text validations only
	if (validation.type != 'RequiredText') return null;
		
	var action = {
		type: 'validate',
		criteria: 'step_match'
	};
	
	if (!_.isArray(validation.parameter)) validation.parameter = [validation.parameter];
	
	// set validation match
	_.each(validation.parameter, function(param) {
		if (param.name === 'Text') {
			action.match = _cdataReplace(param.variable._);
		}
	});
	
	return action;
};

/**
 * Parses .
 *
 * @this {Circle}
 * @return {number} The circumference of the circle.
 */
var _postData = function(kPostData) {
	var ps = [];
	
	if (!kPostData.input) return '';
	
	if (!Array.isArray(kPostData.input)) kPostData.input = [kPostData.input];
	
	kPostData.input.forEach(function(input) {
		var p = ['', ''];
		
		if (input.type === 'Data') {
			input.parameter.forEach(function(param) {
				if (param.name === 'Name') p[0] = _cdataReplace(param.variable._);
				if (param.name === 'Value') p[1] = _cdataReplace(param.variable._);
			});
		}
		
		ps.push(p.join('='));
	});
	
	return ps.join('&');
};

/**
 * Creates a Locator for 
 * 
 * @param {object} kQuery - The Keynote Query object.
 * @return {object} The Locator object.
 */
var _locators = function(element) {
	var attrs = {};
	var locators = [];
	
	if (!_.isArray(element.tag)) element.tag = [element.tag];
	
	var tag = element.tag[0];
	var tagName = (tag.type) ? tag.type.toLowerCase() : '';

	if (tag.attributes) {
		if (!_.isArray(tag.attributes)) tag.attributes = [tag.attributes];

		_.each(tag.attributes, function(attributes) {
			
			if (attributes.attribute) {
				if (!_.isArray(attributes.attribute)) attributes.attribute = [attributes.attribute];
				
				_.each(attributes.attribute, function(attribute) {
					var name = '';
					var value = '';
								
					_.each(attribute.parameter, function(parameter) {
						if (parameter.name === 'Name') name = _cdataReplace(parameter.variable._);
						if (parameter.name === 'Value') value = _cdataReplace(parameter.variable._);
					});
				
					attrs[name] = value;
				});		
			}
		});
	}

	// build locators from attributes
	if (attrs.id) {
		locators.push(['css', '#' + attrs.id.replace(/:/g, '\\:')]);
		locators.push(['dom', 'document.getElementById("' + attrs.id + '")']);
	}
	
	if (tagName) {
		// inner text locator
		if (attrs.innerText) locators.push(['css', tagName + ':contains("' + attrs.innerText + '")']);
			
		// attributes locator
		var selector = '';
	
		if (attrs.type) selector += '[type="' + attrs.type + '"]';
		if (attrs.href) selector += '[href="' + attrs.href + '"]';
		if (attrs.name) selector += '[name="' + attrs.name + '"]';

		if (selector) locators.push(['css', tagName + selector]);
	}
	
	return locators;
};

var _targetWindow = function(context) {
	var targetWindow = 'gomez_top[' + (context.window || 0) + ']';
	targetWindow += (parseInt(context.frame) > 0) ? '.frames[' + context.frame + ']' : '';
	
	return targetWindow;
};

var _clickAction = function(click) {
	var action = { type: 'click', target: {} };
	
	action.target.targetWindow = _targetWindow(click.context);
	action.target.locators = _locators(click.element);
	
	return action;
};

var _formFillAction = function(text) {
	var action = { type: 'setInputValue', target: {}, value: '', encrypted: false };
	
	action.target.targetWindow = _targetWindow(text.context);
	action.target.locators = _locators(text.element);
	
	// Set FormFill value
	if (text.parameter) {
		if (!_.isArray(text.parameter)) text.parameter = [text.parameter];
		
		_.each(text.parameter, function(parameter) {
			if (parameter.name === 'Text') action.value = _cdataReplace(parameter.variable._);
		});
	}
		
	return action;
};

var _selectAction = function(select) {
	var action = { type: 'selectOption', target: {} };
	
	action.target.targetWindow = _targetWindow(select.context);
	action.target.locators = _locators(select.element);
	
	if (select.parameter) {
		var index = '';
		var value = '';
		
		if (!_.isArray(select.parameter)) select.parameter = [select.parameter];
			
		_.each(select.parameter, function(parameter) {
			if (parameter.name === 'Index') index = _cdataReplace(parameter.variable._);
			if (parameter.name === 'Text') value = _cdataReplace(parameter.variable._);
		});
		
		action.optionIndexes = [index];
		action.textValues = [value];
	}
	
	return action;
};

var _customAction = function(script) {
	var action = { type: 'executeJS' };
	
	action.targetWindow = _targetWindow(script.context);
	
	if (script.code && script.code.language === 'JavaScript') {
		if (!_.isArray(script.code.parameter)) script.code.parameter = [script.code.parameter];
		
		_.each(script.code.parameter, function(parameter) {
			if (parameter.name === 'Code') action.jsCode = parameter.variable._;
		});
	}
	
	return action;
};

