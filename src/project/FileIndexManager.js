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


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, brackets */

/**
 * @deprecated
 * This is a compatibility shim for legacy Brackets APIs that will be removed soon.
 * Use ProjectManager.getAllFiles() instead.
 */
define(function (require, exports, module) {
    "use strict";
    
    var PerfUtils           = require("utils/PerfUtils"),
        ProjectManager      = require("project/ProjectManager"),
        Dialogs             = require("widgets/Dialogs"),
        DefaultDialogs      = require("widgets/DefaultDialogs"),
        CollectionUtils     = require("utils/CollectionUtils"),
        Strings             = require("strings");

    /**
     * All the indexes are stored in this object. The key is the name of the index
     * and the value is a FileIndex. 
     */
    var _indexList = {};

    /**
     * Tracks whether _indexList should be considered dirty and invalid. Calls that access
     * any data in _indexList should call syncFileIndex prior to accessing the data.
     * @type {boolean}
     */
    var _indexListDirty = true;

    /**
     * Store whether the index manager has exceeded the limit so the warning dialog only
     * appears once.
     * @type {boolean}
     */
    var _maxFileDialogDisplayed = false;

    /** class FileIndex
     *
     * A FileIndex contains an array of fileInfos that meet the criteria specified by
     * the filterFunction. FileInfo's in the fileInfo array should unique map to one file.
     *  
     * @constructor
     * @param {!string} indexname
     * @param {function({!entry})} filterFunction returns true to indicate the entry
     *                             should be included in the index
     */
    function FileIndex(indexName, filterFunction) {
        this.name = indexName;
        this.fileInfos = [];
        this.filterFunction = filterFunction;
    }

    /** class FileInfo
     * 
     *  Class to hold info about a file that a FileIndex wishes to retain.
     *
     * @constructor
     * @param {!string}
     */
    function FileInfo(entry) {
        this.name = entry.name;
        this.fullPath = entry.fullPath;
    }


    /**
     * Adds a new index to _indexList and marks the list dirty 
     *
     * A future performance optimization is to only build the new index rather than 
     * marking them all dirty
     *
     * @private
     * @param {!string} indexName must be unque
     * @param {!function({entry} filterFunction should return true to include an
     *   entry in the index
     */
    function _addIndex(indexName, filterFunction) {
        if (_indexList.hasOwnProperty(indexName)) {
            console.error("Duplicate index name");
            return;
        }
        if (typeof filterFunction !== "function") {
            console.error("Invalid arguments");
            return;
        }

        _indexList[indexName] = new FileIndex(indexName, filterFunction);

        _indexListDirty = true;
    }


    /**
     * Checks the entry against the filterFunction for each index and adds
     * a fileInfo to the index if the entry meets the criteria. FileInfo's are
     * shared between indexes.
     *
     * @private
     * @param {!entry} entry to be added to the indexes
     */
    // future use when files are incrementally added
    //
    function _addFileToIndexes(entry) {

        // skip invisible files
        if (!ProjectManager.shouldShow(entry)) {
            return;
        }

        var fileInfo = new FileInfo(entry);
        //console.log(entry.name);
  
        CollectionUtils.forEach(_indexList, function (index, indexName) {
            if (index.filterFunction(entry)) {
                index.fileInfos.push(fileInfo);
            }
        });
    }
    
    /**
     * Error dialog when max files in index is hit
     * @return {Dialog}
     */
    function _showMaxFilesDialog() {
        return Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            Strings.ERROR_MAX_FILES_TITLE,
            Strings.ERROR_MAX_FILES
        );
    }

    /* Recursively visits all files that are descendent of dirEntry and adds
     * files files to each index when the file matches the filter critera
     * @private
     * @param {!DirectoryEntry} dirEntry
     * @returns {$.Promise}
     */
    function _scanDirectorySubTree(dirEntry) {
        if (!dirEntry) {
            console.error("Bad dirEntry passed to _scanDirectorySubTree");
            return;
        }

        // keep track of directories as they are asynchronously read. We know we are done
        // when dirInProgress becomes empty again.
        var state = { fileCount: 0,
                      dirInProgress: {},    // directory names that are in progress of being read
                      dirError: {},         // directory names with read errors. key=dir path, value=error
                      maxFilesHit: false    // used to show warning dialog only once
                    };

        var deferred = new $.Deferred();

        // inner helper function
        function _dirScanDone() {
            var key;
            for (key in state.dirInProgress) {
                if (state.dirInProgress.hasOwnProperty(key)) {
                    return false;
                }
            }
            return true;
        }

        function _finishDirScan(dirEntry) {
            //console.log("finished: " + dirEntry.fullPath);
            delete state.dirInProgress[dirEntry.fullPath];

            if (_dirScanDone()) {
                //console.log("dir scan completly done");
                deferred.resolve();
            }
        }

        // inner helper function
        function _scanDirectoryRecurse(dirEntry) {
            // skip invisible directories
            if (!ProjectManager.shouldShow(dirEntry)) {
                return;
            }

            state.dirInProgress[dirEntry.fullPath] = true;
            //console.log("started dir: " + dirEntry.fullPath);

            dirEntry.createReader().readEntries(
                // success callback
                function (entries) {
                    // inspect all children of dirEntry
                    Array.prototype.forEach.call(entries, function (entry) {
                        // For now limit the number of files that are indexed by preventing adding files
                        // or scanning additional directories once a max has been hit. Also notify the 
                        // user once via a dialog. This limit could be increased
                        // if files were indexed in a worker thread so scanning didn't block the UI
                        if (state.fileCount > 10000) {
                            if (!state.maxFilesHit) {
                                state.maxFilesHit = true;
                                if (!_maxFileDialogDisplayed) {
                                    _showMaxFilesDialog();
                                    _maxFileDialogDisplayed = true;
                                } else {
                                    console.warn("The maximum number of files have been indexed. Actions " +
                                                 "that lookup files in the index may function incorrectly.");
                                }
                            }
                            return;
                        }

                        if (entry.isFile) {
                            _addFileToIndexes(entry);
                            state.fileCount++;

                        } else if (entry.isDirectory) {
                            _scanDirectoryRecurse(entry);
                        }
                    });
                    _finishDirScan(dirEntry);
                },
                // error callback
                function (error) {
                    state.dirError[dirEntry.fullPath] = error;
                    _finishDirScan(dirEntry);
                }
            );
        }

        _scanDirectoryRecurse(dirEntry);

        return deferred.promise();
    }
    
    
    function _warn() {
        console.error("Warning: FileIndexManager is deprecated. Use ProjectManager.getAllFiles() instead");
    }


    function _getFilter(indexName) {
        if (indexName === "css") {
            return ProjectManager.getLanguageFilter("css");
        } else if (indexName === "all") {
            return null;
        } else {
            throw new Error("Invalid index name:", indexName);
        }
    }
    
    /**
     * @deprecated
     * @param {!string} indexname
     * @return {$.Promise} a promise that is resolved with an Array of File objects
     */
    function getFileInfoList(indexName) {
        _warn();
        return ProjectManager.getAllFiles(_getFilter(indexName));
    }
    
    /**
     * @deprecated
     * @param {!string} indexName
     * @param {!string} filename
     * @return {$.Promise} a promise that is resolved with an Array of File objects
     */
    function getFilenameMatches(indexName, filename) {
        _warn();
        
        var indexFilter = _getFilter(indexName);
        
        return ProjectManager.getAllFiles(function (file) {
            if (indexFilter && !indexFilter(file)) {
                return false;
            }
            return file.name === filename;
        });
    }
    
    exports.getFileInfoList = getFileInfoList;
    exports.getFilenameMatches = getFilenameMatches;
});
