/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*global define, $, JSLINT, brackets */

/**
 * Provides JSLint results via the core linting extension point
 */
define(function (require, exports, module) {
    "use strict";
    
    // Load JSLint, a non-module lib
    require("thirdparty/jslint/jslint");
    
    // Load dependent modules
    var Commands                = brackets.getModule("command/Commands"),
        PanelManager            = brackets.getModule("view/PanelManager"),
        CommandManager          = brackets.getModule("command/CommandManager"),
        Menus                   = brackets.getModule("command/Menus"),
        DocumentManager         = brackets.getModule("document/DocumentManager"),
        EditorManager           = brackets.getModule("editor/EditorManager"),
        LanguageManager         = brackets.getModule("language/LanguageManager"),
        PreferencesManager      = brackets.getModule("preferences/PreferencesManager"),
        PerfUtils               = brackets.getModule("utils/PerfUtils"),
        Strings                 = brackets.getModule("strings"),
        StringUtils             = brackets.getModule("utils/StringUtils"),
        AppInit                 = brackets.getModule("utils/AppInit"),
        Resizer                 = brackets.getModule("utils/Resizer"),
        ExtensionUtils          = brackets.getModule("utils/ExtensionUtils"),
        StatusBar               = brackets.getModule("widgets/StatusBar"),
        JSLintTemplate          = require("hgn!htmlContent/bottom-panel.html"),
        ResultsTemplate         = require("hgn!htmlContent/results-table.html"),
        GoldStarTemplate        = require("hgn!htmlContent/gold-star.html");

    var CodeInspection     = brackets.getModule("language/CodeInspection"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        Strings            = brackets.getModule("strings"),
        _                  = brackets.getModule("thirdparty/lodash");
    
    var prefs = PreferencesManager.getExtensionPrefs("jslint");
    
    /**
     * @private
     * 
     * Used to keep track of the last options JSLint was run with to avoid running
     * again when there were no changes.
     */
    var _lastRunOptions;
    
    prefs.definePreference("options", "object")
        .on("change", function (e, data) {
            var options = prefs.get("options");
            if (!_.isEqual(options, _lastRunOptions)) {
                CodeInspection.requestRun(Strings.JSLINT_NAME);
            }
        });
    
    // Predefined environments understood by JSLint.
    var ENVIRONMENTS = ["browser", "node", "couch", "rhino"];
    
    /**
     * Run JSLint on the current document. Reports results to the main UI. Displays
     * a gold star when no errors are found.
     */
    function lintOneFile(text, fullPath) {
        // If a line contains only whitespace, remove the whitespace
        // This should be doable with a regexp: text.replace(/\r[\x20|\t]+\r/g, "\r\r");,
        // but that doesn't work.
        var i, arr = text.split("\n");
        for (i = 0; i < arr.length; i++) {
            if (!arr[i].match(/\S/)) {
                arr[i] = "";
            }
            text = arr.join("\n");
            
            var result = JSLINT(text, null);

            PerfUtils.addMeasurement(perfTimerLint);
            perfTimerDOM = PerfUtils.markStart("JSLint DOM:\t" + (!currentDoc || currentDoc.file.fullPath));
            
            if (!result) {
                // Remove the null errors for the template
                var errors = JSLINT.errors.filter(function (err) { return err !== null; });
                var html   = ResultsTemplate({reportList: errors});
                var $selectedRow;

                $lintResults.find(".table-container")
                    .empty()
                    .append(html)
                    .scrollTop(0)  // otherwise scroll pos from previous contents is remembered
                    .on("click", function (e) {
                        if ($selectedRow) {
                            $selectedRow.removeClass("selected");
                        }
        
                        $selectedRow  = $(e.target).closest("tr");
                        $selectedRow.addClass("selected");
                        var lineTd    = $selectedRow.find("td.line");
                        var line      = lineTd.text();
                        var character = lineTd.data("character");
        
        var options = prefs.get("options");

        if (!options) {
            options = {};
        } else {
            options = _.clone(options);
        }
        
        if (!options.indent) {
            // default to using the same indentation value that the editor is using
            options.indent = PreferencesManager.get("spaceUnits");
        }
        
        // If the user has not defined the environment, we use browser by default.
        var hasEnvironment = _.some(ENVIRONMENTS, function (env) {
            return options[env] !== undefined;
        });
        
        if (!hasEnvironment) {
            options.browser = true;
        }

        _lastRunOptions = _.clone(options);
        
        var jslintResult = JSLINT(text, options);
        
        if (!jslintResult) {
            // Remove any trailing null placeholder (early-abort indicator)
            var errors = JSLINT.errors.filter(function (err) { return err !== null; });
            
            errors = errors.map(function (jslintError) {
                return {
                    // JSLint returns 1-based line/col numbers
                    pos: { line: jslintError.line - 1, ch: jslintError.character - 1 },
                    message: jslintError.reason,
                    type: CodeInspection.Type.WARNING
                };
            });
            
            var result = { errors: errors };

            // If array terminated in a null it means there was a stop notice
            if (errors.length !== JSLINT.errors.length) {
                result.aborted = true;
                errors[errors.length - 1].type = CodeInspection.Type.META;
            }
            
            return result;
        }
        return null;
    }
    
<<<<<<< HEAD
    /** Command to toggle enablement */
    function handleToggleEnabled() {
        setEnabled(!_enabled);
    }
    
    /** Command to go to the first JSLint Error */
    function handleGotoFirstError() {
        run();
        if (_gotoEnabled) {
            $lintResults.find("tr:first-child").trigger("click");
        }
    }
    
    
    // Register command handlers
    CommandManager.register(Strings.CMD_JSLINT,             TOGGLE_ENABLED,   handleToggleEnabled);
    CommandManager.register(Strings.CMD_JSLINT_FIRST_ERROR, GOTO_FIRST_ERROR, handleGotoFirstError);
    
    // Add the menu items
    var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
    menu.addMenuItem(TOGGLE_ENABLED, "", Menus.AFTER, Commands.TOGGLE_WORD_WRAP);
    menu.addMenuDivider(Menus.AFTER, Commands.TOGGLE_WORD_WRAP);
    
    menu = Menus.getMenu(Menus.AppMenuBar.NAVIGATE_MENU);
    menu.addMenuItem(GOTO_FIRST_ERROR, KeyboardPrefs.gotoFirstError, Menus.AFTER, Commands.NAVIGATE_GOTO_DEFINITION);
    
    
    // Init PreferenceStorage
    _prefs = PreferencesManager.getPreferenceStorage(module, defaultPrefs);
    
    // Initialize items dependent on HTML DOM
    AppInit.htmlReady(function () {
        ExtensionUtils.loadStyleSheet(module, "jslint.css");
        
        var jsLintHtml = JSLintTemplate(Strings);
        var resultsPanel = PanelManager.createBottomPanel("jslint.results", $(jsLintHtml), 100);

        $lintResults = $("#jslint-results");
        
        var lintStatusHtml = GoldStarTemplate(Strings);
        $(lintStatusHtml).insertBefore("#status-language");
        StatusBar.addIndicator(INDICATOR_ID, $("#lint-status"));
        $("#jslint-results .close").click(function () {
            toggleCollapsed(true);
        });

        $("#jslint-status").click(function () {
            toggleCollapsed();
        });
                                                                
                                
        // Called on HTML ready to trigger the initial UI state
        setEnabled(_prefs.getValue("enabled"));
        
        toggleCollapsed(_prefs.getValue("collapsed"));
                
=======
    // Register for JS files
    CodeInspection.register("javascript", {
        name: Strings.JSLINT_NAME,
        scanFile: lintOneFile
>>>>>>> 06240746a50ab8e2878f4bceaedb4cfcdf3c5453
    });
});
