/*
 DfdLite
 The light version of deferred API compatible with jquery promises

 MIT License

 Copyright (c) 2014 artemplatonov.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */
 (function (root) {

    var noop = function () {};

    /**
     * @param {*} o
     * @returns {boolean}
     */
    var isPromise = function (o) {
        return o !== null 
            && typeof o === 'object' 
            && typeof o.promise === 'function' 
            && !DfdLite.isThis(o);
    };


    /**
    * DfdLite
    * @constructor
    */
    function DfdLite () {
        this._state = DfdLite.STATE.PENDING;
        this._data = undefined;
        this._onResolvedCbs = [];
        this._onRejectedCbs = [];
        this._onFinallyCbs = [];
    }

    /**
     * @enum DfdLite.STATE
     */
    DfdLite.STATE = {
        PENDING: 'pending',
        RESOLVED: 'resolved',
        REJECTED: 'rejected'
    };

    /**
     * @param {?Object} d
     * @returns {boolean}
     */
    DfdLite.isThis = function (d) {
        return d instanceof DfdLite;
    };

    /**
     * @typedef {Object} Promise
     * @property {function} progress
     * @property {function} promise
     * @property {function} state
     * @property {function} done
     * @property {function} fail
     * @property {function} always
     */

    /**
     * @param {*} result
     * @returns {Promise}
     */
    DfdLite.when = function (result) {
        if (isPromise(result)) {
            return result;
        }
        var dfd = DfdLite.isThis(result) ? result : new DfdLite().resolve(result);

        return {

            progress: noop,

            /**
             * @returns {Promise}
             */
            promise: function () {
                return this;
            },

            /**
             * @returns {DfdLite.STATE}
             */
            state: function () {
                return dfd._state;
            },

            /**
             * @param {function(data)} cb
             * @returns {Promise}
             */
            done: function (cb) {
                var newDfd = new DfdLite();

                dfd._onResolvedCbs.push(function (data) {
                    var result = cb(data);
                    if (isPromise(result)) {
                        result.done(newDfd.resolve.bind(newDfd));
                        result.fail(newDfd.reject.bind(newDfd));
                    } else {
                        newDfd.resolve(result)
                    }
                });
                dfd._state === DfdLite.STATE.RESOLVED && dfd._onResolved();

                return newDfd.promise();
            },

            /**
             * @param {function(reason)} cb
             * @returns {Promise}
             */
            fail: function (cb) {
                dfd._onRejectedCbs.push(cb);
                dfd._state === DfdLite.STATE.REJECTED && dfd._onRejected();
                return this;
            },

            /**
             * @param {function} cb
             * @returns {Promise}
             */
            always: function (cb) {
                dfd._onFinallyCbs.push(cb);
                dfd._state !== DfdLite.STATE.PENDING && dfd._onAlways();
                return this;
            }
        };
    };

    /**
     * @param {!Array} dfrds
     * @returns {boolean}
     */
    DfdLite.checkAllResolved = function (dfrds) {
        for (var i = 0, d; i < dfrds.length;) {
            d = dfrds[i++];
            if ((isPromise(d) || DfdLite.isThis(d)) && d.state() !== DfdLite.STATE.RESOLVED) {
                return false;
            }
        }
        return true;
    };

    /**
     * @param {!Array} dfrds
     * @returns {Array}
     */
    DfdLite.getValuesRef = function (dfrds) {
        var values = [], i = 0;
        var process = function (index) {
            var d = dfrds[index];
            if (isPromise(d) || DfdLite.isThis(d)) {
                d.done(function (value) {
                    values[index] = value;
                });
                d.fail(function (value) {
                    values[index] = value;
                });
            } else {
                values[index] = d;
            }
        };
        for (; i < dfrds.length;) {
            process(i++);
        }
        return values;
    };

    /**
     * @param {!Array} dfrds
     * @returns {Promise}
     */
    DfdLite.all = function (dfrds) {
        var master = new DfdLite(), i = 0, values = this.getValuesRef(dfrds);
        var onFail = function () {
            master.state() === DfdLite.STATE.PENDING && master.reject(values);
        };
        var onDone = function () {
            master.state() === DfdLite.STATE.PENDING && DfdLite.checkAllResolved(dfrds) && master.resolve(values);
        };

        DfdLite.checkAllResolved(dfrds) && master.resolve(values);

        for (;i < dfrds.length;) {
            DfdLite.when(dfrds[i++])
                .fail(onFail)
                .done(onDone);
        }

        return DfdLite.when(master);
    };

    DfdLite.prototype = {

        /**
         * @returns {Promise}
         */
        promise: function () {
            return DfdLite.when(this);
        },

        /**
         * @returns {DfdLite.STATE}
         */
        state: function () {
            return this._state;
        },

        /**
         * @param {*} value
         * @returns {DfdLite}
         */
        resolve: function (value) {
            this._state = DfdLite.STATE.RESOLVED;
            this._data = value;
            this._onResolved();
            return this;
        },

        /**
         * @param {*} reason
         * @returns {DfdLite}
         */
        reject: function (reason) {
            this._state = DfdLite.STATE.REJECTED;
            this._data = reason;
            this._onRejected();
            return this;
        },

        _onResolved: function () {
            this._executeCallbacks(this._onResolvedCbs, this._data);
            this._onAlways();
        },

        _onRejected: function () {
            this._executeCallbacks(this._onRejectedCbs, this._data);
            this._onAlways();
        },

        _onAlways: function () {
            this._executeCallbacks(this._onFinallyCbs);
            this._onResolvedCbs.length = 0;
            this._onRejectedCbs.length = 0;
            this._onFinallyCbs.length = 0;
        },

        _executeCallbacks: function (cbs, arg) {
            for (var i = 0,l = cbs.length; i < l; i++) {
                cbs[i].call(this, arg);
            }
        }
    };
    
    return (root.DfdLite = DfdLite);
 })(window);
