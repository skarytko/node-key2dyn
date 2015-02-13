var _ = require('underscore');
var xml2js = require('xml2js');

/**
 * Creates an instance of Converter.
 *
 * @constructor
 * @this {Converter}
 */
var Converter = module.exports = function() {
//	this.keynoteScript = kScript || '';
	this.script = {};
	this._xmlParser = xml2js.parseString;
};

/**
 * Set the default properties of the script
 * 
 * @this {Converter}
 */
Converter.prototype._setScriptDefaults = function(script) {
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
 * Converts Keynote script into Dynatrace (Gomez) script.
 * 
 * @this {Converter}
 * @return {object} The script object.
 */
Converter.prototype.convertScript = function(keynoteScript) {
	var self = this;
	var script = {};
	
	script = this._setScriptDefaults(script);

	// parse script name
	script.name = this._cdataReplace(keynoteScript.name) || this._cdataReplace(keynoteScript.description);

	// parse script steps
	if (keynoteScript.actions && keynoteScript.actions.action) {
		script.steps = this._steps(keynoteScript.actions.action);
	}
	
	// parse cookies
	if (keynoteScript.cookies && keynoteScript.cookies.cookie) {
		var cookies = this._cookies(keynoteScript.cookies.cookie);
		
		if (!script.steps[0]) {
			script.steps[0] = { actions: [] };
		}

		script.steps[0].actions = cookies.concat(script.steps[0].actions);
	}
	
	return script;
};

/**
 * Parses Keynote script XML string to object.
 * 
 * @this {Converter}
 * @param {string} Keynote script XML string.
 * @callback 
 * @return {object} XML Parser object.
 */
Converter.prototype.parseScript = function(xmlScript, callback) {
	callback = (typeof callback === 'function') ? callback : function() {};
	
	return this._xmlParser(xmlScript, { explicitArray: false, mergeAttrs: true }, function(err, result) {
		if (err) callback(err);
	
		var scriptObj = result.script || {};
	
		callback(null, scriptObj);
	});
};

/**
 * Utility function to replace bad characters resulting from CDATA headers.
 * 
 * @this {Converter}
 * @param {string}  The input string.
 * @return {string} The replaced string.
 */
Converter.prototype._cdataReplace = function(string) {
	if (string) {
		return string.replace(/\t|\r|\n/g, '');
	} else {
		return '';
	}
};
	
Converter.prototype._steps = function(actions) {
	var self = this;
	var steps = [];
	
	if (!_.isArray(actions)) actions = [actions];
	
	// each step (Keynote actions = step)
	_.each(actions, function(action) {
		var step = {};
		
		// parse step description
		step.description = self._cdataReplace(action.name) || self._cdataReplace(action.description);
		
		step.actions = [];
		
		// parse actions
		if (action.step) {
			step.actions = self._actions(action.step);
		}
		
		// parse waits
		if (action.completion) {
			step.actions.push(self._waitAction('page_complete'));
		}

		// parse validations
		if (action.validation && action.validation.validate) {
			var validates = self._validates(action.validation.validate);
			
			// merge validates at end of step
			step.actions.concat(validates);
		}

		steps.push(step);
	});
	
	return steps;
};

Converter.prototype._actions = function(steps) {
	var self = this;
	var actions = [];
	
	if (!_.isArray(steps)) steps = [steps];

	// each action
	_.each(steps, function(step) {
		var action = {};

		switch(step.type) {
		case 'Navigate':
			action = self._navigateAction(step);
			break;
		case 'Click':
			action = self._clickAction(step);
			break;
		case 'Text':
			action = self._formFillAction(step);
			break;
		case 'Select':
			action = self._selectAction(step);
			break;
		case 'Script':
			action = self._customAction(step);
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

Converter.prototype._validates = function(validates) {
	var self = this;
	var actions = [];
	
	if (!_.isArray(validates)) validates = [validates];
	
	_.each(validates, function(validate) {
		var action = self._validateAction(validate);
		
		actions.push(action);
	});
	
	return actions;
};

Converter.prototype._cookies = function(cookies) {
	var self = this;
	var actions = [];
	
	if (!_.isArray(cookies)) cookies = [cookies];
	
	_.each(cookies, function(cookie) {
		var action = self._cookieAction(cookie);
		
		actions.push(action);
	});
	
	return actions;
};

Converter.prototype._cookieAction = function(cookie) {
	var self = this;
	var action = { type: 'setCookie' };
	
	action.url = (cookie.secure > 0) ? 'https://' : 'http://';
	
	if (cookie.parameter) {
		if (!_.isArray(cookie.parameter)) cookie.parameter = [cookie.parameter];
		
		_.each(cookie.parameter, function(param) {
			if (param.name === 'Name') action.name = self._cdataReplace(param.variable._);
			if (param.name === 'Value') action.value = self._cdataReplace(param.variable._);
			if (param.name === 'Domain') action.url += self._cdataReplace(param.variable._);
			if (param.name === 'Path') action.url += self._cdataReplace(param.variable._);
		});
	}
	
	return action;
};

Converter.prototype._waitAction = function(criteria) {
	var action = {
		type: 'wait',
		criteria: criteria || 'network'
	};
	
	return action;
};

Converter.prototype._navigateAction = function(step) {
	var self = this;
	var action = { 
		type: 'navigate',
		url: ''
	};
	
	// get navigate url
	if (step.parameter) {
		if (!_.isArray(step.parameter)) step.parameter = [step.parameter];
		
		_.each(step.parameter, function(param) {
			if (param.name === 'URL') action.url = self._cdataReplace(param.variable._);
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
		action.url = action.url + '?' + self._queryString(step.query);
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
Converter.prototype._validateAction = function(validation) {
	var self = this;
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
			action.match = self._cdataReplace(param.variable._);
		}
	});
	
	return action;
};

/**
 * Parses query string from Keynote Query object.
 * 
 * @this {Converter}
 * @param {object} kQuery - The Keynote Query object.
 * @return {string} The query string.
 */
Converter.prototype._queryString = function(kQuery) {
	var self = this;
	var qs = [];
	
	if (!_.isArray(kQuery)) kQuery = [kQuery];
	
	kQuery.forEach(function(query) {
		var q = ['', ''];
		
		_.each(query.parameter, function(param) {
			if (param.name === 'Name') q[0] = self._cdataReplace(param.variable._) || '';
			if (param.name === 'Value') q[1] = self._cdataReplace(param.variable._) || '';
		});

		qs.push(q.join('='));
	});

	return qs.join('&');
};

/**
 * Parses .
 *
 * @this {Circle}
 * @return {number} The circumference of the circle.
 */
Converter.prototype._postData = function(kPostData) {
	var self = this;
	var ps = [];
	
	if (!kPostData.input) return '';
	
	if (!Array.isArray(kPostData.input)) kPostData.input = [kPostData.input];
	
	kPostData.input.forEach(function(input) {
		var p = ['', ''];
		
		if (input.type === 'Data') {
			input.parameter.forEach(function(param) {
				if (param.name === 'Name') p[0] = self._cdataReplace(param.variable._);
				if (param.name === 'Value') p[1] = self._cdataReplace(param.variable._);
			});
		}
		
		ps.push(p.join('='));
	});
	
	return ps.join('&');
};

/**
 * Creates a Locator for 
 * 
 * @this {Converter}
 * @param {object} kQuery - The Keynote Query object.
 * @return {object} The Locator object.
 */
Converter.prototype._locators = function(element) {
	var self = this;
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
						if (parameter.name === 'Name') name = self._cdataReplace(parameter.variable._);
						if (parameter.name === 'Value') value = self._cdataReplace(parameter.variable._);
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

Converter.prototype._targetWindow = function(context) {
	var targetWindow = 'gomez_top[' + (context.window || 0) + ']';
	targetWindow += (parseInt(context.frame) > 0) ? '.frames[' + context.frame + ']' : '';
	
	return targetWindow;
};

Converter.prototype._clickAction = function(click) {
	var action = { type: 'click', target: {} };
	
	action.target.targetWindow = this._targetWindow(click.context);
	action.target.locators = this._locators(click.element);
	
	return action;
};

Converter.prototype._formFillAction = function(text) {
	var self = this;
	var action = { type: 'setInputValue', target: {}, value: '', encrypted: false };
	
	action.target.targetWindow = this._targetWindow(text.context);
	action.target.locators = this._locators(text.element);
	
	// Set FormFill value
	if (text.parameter) {
		if (!_.isArray(text.parameter)) text.parameter = [text.parameter];
		
		_.each(text.parameter, function(parameter) {
			if (parameter.name === 'Text') action.value = self._cdataReplace(parameter.variable._);
		});
	}
		
	return action;
};

Converter.prototype._selectAction = function(select) {
	var self = this;
	var action = { type: 'selectOption', target: {} };
	
	action.target.targetWindow = this._targetWindow(select.context);
	action.target.locators = this._locators(select.element);
	
	if (select.parameter) {
		var index = '';
		var value = '';
		
		if (!_.isArray(select.parameter)) select.parameter = [select.parameter];
			
		_.each(select.parameter, function(parameter) {
			if (parameter.name === 'Index') index = self._cdataReplace(parameter.variable._);
			if (parameter.name === 'Text') value = self._cdataReplace(parameter.variable._);
		});
		
		action.optionIndexes = [index];
		action.textValues = [value];
	}
	
	return action;
};

Converter.prototype._customAction = function(script) {
	var action = { type: 'executeJS' };
	
	action.targetWindow = this._targetWindow(script.context);
	
	if (script.code && script.code.language === 'JavaScript') {
		if (!_.isArray(script.code.parameter)) script.code.parameter = [script.code.parameter];
		
		_.each(script.code.parameter, function(parameter) {
			if (parameter.name === 'Code') action.jsCode = parameter.variable._;
		});
	}
	
	return action;
};
