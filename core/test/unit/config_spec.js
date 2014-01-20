/*globals describe, it, beforeEach, afterEach */

var should         = require('should'),
    sinon          = require('sinon'),
    when           = require('when'),
    path           = require('path'),
    fs             = require('fs'),
    _              = require('underscore'),
    rewire         = require("rewire"),

    testUtils      = require('../utils'),

    // Thing we are testing
    defaultConfig  = require('../../../config.example')[process.env.NODE_ENV],
    loader         = rewire('../../server/config/loader'),
    theme          = rewire('../../server/config/theme'),
    paths          = rewire('../../server/config/paths');

describe('Config', function () {

    describe('Loader', function () {
        var sandbox,
            rejectMessage = loader.__get__('rejectMessage'),
            overrideConfig = function (newConfig) {
                loader.__set__("readConfigFile",  sandbox.stub().returns(
                    _.extend({}, defaultConfig, newConfig)
                ));
            };



        beforeEach(function () {
            sandbox = sinon.sandbox.create();
        });

        afterEach(function () {
            loader         = rewire('../../server/config/loader');
            sandbox.restore();

        });

        it('loads the config file if one exists', function (done) {
            // the test infrastructure is setup so that there is always config present,
            // but we want to overwrite the test to actually load config.example.js, so that any local changes
            // don't break the tests
            loader.__set__("configFile",  path.join(paths().appRoot, 'config.example.js'));

            loader().then(function (config) {
                config.url.should.equal(defaultConfig.url);
                config.database.client.should.equal(defaultConfig.database.client);
                config.database.connection.should.eql(defaultConfig.database.connection);
                config.server.host.should.equal(defaultConfig.server.host);
                config.server.port.should.equal(defaultConfig.server.port);

                done();
            }).then(null, done);
        });

        it('creates the config file if one does not exist', function (done) {

            var deferred = when.defer(),
                // trick loader into thinking that the config file doesn't exist yet
                existsStub  = sandbox.stub(fs, 'exists', function (file, cb) { return cb(false); }),
                // create a method which will return a pre-resolved promise
                resolvedPromise = sandbox.stub().returns(deferred.promise);

            deferred.resolve();

            // ensure that the file creation is a stub, the tests shouldn't really create a file
            loader.__set__("writeConfigFile",  resolvedPromise);
            loader.__set__("validateConfigEnvironment",  resolvedPromise);

            loader().then(function () {
                existsStub.calledOnce.should.be.true;
                resolvedPromise.calledTwice.should.be.true;
                done();
            }).then(null, done);
        });

        it('accepts valid urls', function (done) {
            // replace the config file with invalid data
            overrideConfig({url: 'http://testurl.com'});

            loader().then(function (localConfig) {
                localConfig.url.should.equal('http://testurl.com');

                // Next test
                overrideConfig({url: 'https://testurl.com'});
                return loader();
            }).then(function (localConfig) {
                localConfig.url.should.equal('https://testurl.com');

                 // Next test
                overrideConfig({url: 'http://testurl.com/blog/'});
                return loader();
            }).then(function (localConfig) {
                localConfig.url.should.equal('http://testurl.com/blog/');

                 // Next test
                overrideConfig({url: 'http://testurl.com/ghostly/'});
                return loader();
            }).then(function (localConfig) {
                localConfig.url.should.equal('http://testurl.com/ghostly/');

                // Next test
                overrideConfig({url: '//testurl.com'});
                return loader();
            }).then(function (localConfig) {
                localConfig.url.should.equal('//testurl.com');

                done();
            }).then(null, done);
        });

        it('rejects invalid urls', function (done) {
            // replace the config file with invalid data
            overrideConfig({url: 'notvalid'});

            loader().otherwise(function (error) {
                error.should.include(rejectMessage);

                // Next test
                overrideConfig({url: 'something.com'});
                return loader();
            }).otherwise(function (error) {
                error.should.include(rejectMessage);

                done();
            }).then(function () {
                should.fail('no error was thrown when it should have been');
                done();
            }).then(done, null);
        });

        it('does not permit subdirectories named ghost', function (done) {
            // replace the config file with invalid data
            overrideConfig({url: 'http://testurl.com/ghost/'});

            loader().otherwise(function (error) {
                error.should.include(rejectMessage);

                 // Next test
                overrideConfig({url: 'http://testurl.com/ghost/blog/'});
                return loader();
            }).otherwise(function (error) {
                error.should.include(rejectMessage);

                // Next test
                overrideConfig({url: 'http://testurl.com/blog/ghost'});
                return loader();
            }).otherwise(function (error) {
                error.should.include(rejectMessage);

                done();
            }).then(function () {
                should.fail('no error was thrown when it should have been');
                done();
            }).then(done, null);
        });

        it('requires a database config', function (done) {
            // replace the config file with invalid data
            overrideConfig({database: null});

            loader().otherwise(function (error) {
                error.should.include(rejectMessage);

                // Next test
                overrideConfig({database: {}});
                return loader();
            }).otherwise(function (error) {
                error.should.include(rejectMessage);

                done();
            }).then(function () {
                should.fail('no error was thrown when it should have been');
                done();
            }).then(done, null);
        });


        it('requires a socket or a host and port', function (done) {
            // replace the config file with invalid data
            overrideConfig({server: {socket: 'test'}});

            loader().then(function (localConfig) {
                localConfig.server.socket.should.equal('test');

                  // Next test
                overrideConfig({server: null});
                return loader();
            }).otherwise(function (error) {
                error.should.include(rejectMessage);

                // Next test
                overrideConfig({server: {host: null}});
                return loader();
            }).otherwise(function (error) {
                error.should.include(rejectMessage);

                // Next test
                overrideConfig({server: {port: null}});
                return loader();
            }).otherwise(function (error) {
                error.should.include(rejectMessage);

                // Next test
                overrideConfig({server: {host: null, port: null}});
                return loader();
            }).otherwise(function (error) {
                error.should.include(rejectMessage);

                done();
            }).then(function () {
                should.fail('no error was thrown when it should have been');
                done();
            }).then(done, null);
        });
    });

    describe('Theme', function () {

        var sandbox,
            settings,
            settingsStub;

        beforeEach(function (done) {
            sandbox = sinon.sandbox.create();

            settings = {'read': function read() {}};

            settingsStub = sandbox.stub(settings, 'read', function () {
                return when({value: 'casper'});
            });

            theme.update(settings, 'http://my-ghost-blog.com')
                .then(done)
                .then(null, done);
        });

        afterEach(function (done) {
            theme.update(settings, defaultConfig.url)
                .then(done)
                .then(null, done);

            sandbox.restore();
        });

        it('should have exactly the right keys', function () {
            var themeConfig = theme();

            // This will fail if there are any extra keys
            themeConfig.should.have.keys('url', 'title', 'description', 'logo', 'cover');
        });

        it('should have the correct values for each key', function () {
            var themeConfig = theme();

            // Check values are as we expect
            themeConfig.should.have.property('url', 'http://my-ghost-blog.com');
            themeConfig.should.have.property('title', 'casper');
            themeConfig.should.have.property('description', 'casper');
            themeConfig.should.have.property('logo', 'casper');
            themeConfig.should.have.property('cover', 'casper');

            // Check settings.read gets called exactly 4 times
            settingsStub.callCount.should.equal(4);
        });
    });

    describe('Paths', function () {
        var sandbox;

        beforeEach(function () {
            sandbox = sinon.sandbox.create();
        });

        afterEach(function (done) {
            sandbox.restore();
            paths.update(defaultConfig.url)
                .then(done)
                .then(null, done);
        });

        it('should have exactly the right keys', function () {
            var pathConfig = paths();

            // This will fail if there are any extra keys
            pathConfig.should.have.keys(
                'appRoot',
                'subdir',
                'config',
                'configExample',
                'contentPath',
                'corePath',
                'themePath',
                'pluginPath',
                'imagesPath',
                'imagesRelPath',
                'adminViews',
                'helperTemplates',
                'exportPath',
                'lang',
                'debugPath',
                'availableThemes',
                'availablePlugins'
            );
        });

        it('should have the correct values for each key', function () {
            var pathConfig = paths(),
                appRoot = path.resolve(__dirname, '../../../');

            pathConfig.should.have.property('appRoot', appRoot);
            pathConfig.should.have.property('subdir', '');
        });

        it('should not return a slash for subdir', function (done) {
            paths.update('http://my-ghost-blog.com').then(function () {
                paths().should.have.property('subdir', '');

                return paths.update('http://my-ghost-blog.com/');
            }).then(function () {
                paths().should.have.property('subdir', '');

                done();
            }).otherwise(done);
        });

        it('should handle subdirectories properly', function (done) {
            paths.update('http://my-ghost-blog.com/blog').then(function () {
                paths().should.have.property('subdir', '/blog');

                return paths.update('http://my-ghost-blog.com/blog/');
            }).then(function () {
                paths().should.have.property('subdir', '/blog');

                return paths.update('http://my-ghost-blog.com/my/blog');
            }).then(function () {
                paths().should.have.property('subdir', '/my/blog');

                return paths.update('http://my-ghost-blog.com/my/blog/');
            }).then(function () {
                paths().should.have.property('subdir', '/my/blog');

                done();
            }).otherwise(done);
        });
    });

    describe('urlFor', function () {

        afterEach(function (done) {
            paths.update(defaultConfig.url)
                .then(done)
                .then(null, done);
        });

        it('should return the home url with no options', function (done) {
            paths.urlFor().should.equal('/');
            paths.update('http://my-ghost-blog.com/blog').then(function () {
                paths.urlFor().should.equal('/blog/');

                done();
            });
        });

        it('should return home url when asked for', function (done) {
            var testContext = 'home';

            paths.update('http://my-ghost-blog.com').then(function () {
                paths.urlFor(testContext).should.equal('/');
                paths.urlFor(testContext, true).should.equal('http://my-ghost-blog.com/');

                return paths.update('http://my-ghost-blog.com/blog');
            }).then(function () {
                paths.urlFor(testContext).should.equal('/blog/');
                paths.urlFor(testContext, true).should.equal('http://my-ghost-blog.com/blog/');

                done();
            });
        });

        it('should return rss url when asked for', function (done) {
            var testContext = 'rss';

            paths.update('http://my-ghost-blog.com').then(function () {
                paths.urlFor(testContext).should.equal('/rss/');
                paths.urlFor(testContext, true).should.equal('http://my-ghost-blog.com/rss/');
                return paths.update('http://my-ghost-blog.com/blog');
            }).then(function () {
                paths.urlFor(testContext).should.equal('/blog/rss/');
                paths.urlFor(testContext, true).should.equal('http://my-ghost-blog.com/blog/rss/');

                done();
            });
        });

        it('should return url for a random path when asked for', function (done) {
            var testContext = {relativeUrl: '/about/'};

            paths.update('http://my-ghost-blog.com').then(function () {
                paths.urlFor(testContext).should.equal('/about/');
                paths.urlFor(testContext, true).should.equal('http://my-ghost-blog.com/about/');

                return paths.update('http://my-ghost-blog.com/blog');
            }).then(function () {
                paths.urlFor(testContext).should.equal('/blog/about/');
                paths.urlFor(testContext, true).should.equal('http://my-ghost-blog.com/blog/about/');

                done();
            });
        });

        it('should return url for a post when asked for', function (done) {
            var testContext = 'post',
                testData = {post: testUtils.DataGenerator.Content.posts[2], permalinks: {value: '/:slug/'}};

            paths.update('http://my-ghost-blog.com').then(function () {
                paths.urlFor(testContext, testData).should.equal('/short-and-sweet/');
                paths.urlFor(testContext, testData, true).should.equal('http://my-ghost-blog.com/short-and-sweet/');

                return paths.update('http://my-ghost-blog.com/blog');
            }).then(function () {
                paths.urlFor(testContext, testData).should.equal('/blog/short-and-sweet/');
                paths.urlFor(testContext, testData, true).should.equal('http://my-ghost-blog.com/blog/short-and-sweet/');

                done();
            }).then(null, done);
        });

        it('should return url for a dated post when asked for', function (done) {
            var testContext = 'post',
                testData = {
                    post: testUtils.DataGenerator.Content.posts[2],
                    permalinks: {value: '/:year/:month/:day/:slug/'}
                },
                today = new Date(),
                dd = ("0" + today.getDate()).slice(-2),
                mm = ("0" + (today.getMonth() + 1)).slice(-2),
                yyyy = today.getFullYear(),
                postLink = '/' + yyyy + '/' + mm + '/' + dd + '/short-and-sweet/';

            paths.update('http://my-ghost-blog.com').then(function () {
                paths.urlFor(testContext, testData).should.equal(postLink);
                paths.urlFor(testContext, testData, true).should.equal('http://my-ghost-blog.com' + postLink);

                return paths.update('http://my-ghost-blog.com/blog');
            }).then(function () {
                paths.urlFor(testContext, testData).should.equal('/blog' + postLink);
                paths.urlFor(testContext, testData, true).should.equal('http://my-ghost-blog.com/blog' + postLink);

                done();
            }).then(null, done);
        });

    });

    describe('urlForPost', function () {
        var sandbox;

        beforeEach(function () {
            sandbox = sinon.sandbox.create();
        });

        afterEach(function (done) {
            sandbox.restore();
            paths.update(defaultConfig.url)
                .then(done)
                .then(null, done);
        });

        it('should output correct url for post', function (done) {
            var  settings = {'read': function read() {}},
                settingsStub = sandbox.stub(settings, 'read', function () {
                    return when({value: '/:slug/'});
                }),
                testData = testUtils.DataGenerator.Content.posts[2],
                postLink = '/short-and-sweet/';

            paths.update('http://my-ghost-blog.com').then(function () {

                // next test
                return paths.urlForPost(settings, testData);
            }).then(function (url) {
                url.should.equal(postLink);

                // next test
                return paths.urlForPost(settings, testData, true);
            }).then(function (url) {
                url.should.equal('http://my-ghost-blog.com' + postLink);

                return paths.update('http://my-ghost-blog.com/blog');
            }).then(function () {

                // next test
                return paths.urlForPost(settings, testData);
            }).then(function (url) {
                url.should.equal('/blog' + postLink);

                // next test
                return paths.urlForPost(settings, testData, true);
            }).then(function (url) {
                url.should.equal('http://my-ghost-blog.com/blog' + postLink);

                done();
            }).then(null, done);

        });

        it('should output correct url for post with date permalink', function (done) {
            var settings = {'read': function read() {}},
                settingsStub = sandbox.stub(settings, 'read', function () {
                    return when({value: '/:year/:month/:day/:slug/'});
                }),
                testData = testUtils.DataGenerator.Content.posts[2],
                today = new Date(),
                dd = ("0" + today.getDate()).slice(-2),
                mm = ("0" + (today.getMonth() + 1)).slice(-2),
                yyyy = today.getFullYear(),
                postLink = '/' + yyyy + '/' + mm + '/' + dd + '/short-and-sweet/';

            paths.update('http://my-ghost-blog.com').then(function () {

                // next test
                return paths.urlForPost(settings, testData);
            }).then(function (url) {
                url.should.equal(postLink);

                // next test
                return paths.urlForPost(settings, testData, true);
            }).then(function (url) {
                url.should.equal('http://my-ghost-blog.com' + postLink);

                return paths.update('http://my-ghost-blog.com/blog');
            }).then(function () {

                // next test
                return paths.urlForPost(settings, testData);
            }).then(function (url) {
                url.should.equal('/blog' + postLink);

                // next test
                return paths.urlForPost(settings, testData, true);
            }).then(function (url) {
                url.should.equal('http://my-ghost-blog.com/blog' + postLink);

                done();
            }).then(null, done);
        });

        it('should output correct url for page with date permalink', function (done) {
            var settings = {'read': function read() {}},
                settingsStub = sandbox.stub(settings, 'read', function () {
                    return when({value: '/:year/:month/:day/:slug/'});
                }),
                testData = testUtils.DataGenerator.Content.posts[5],
                postLink = '/static-page-test/';

            paths.update('http://my-ghost-blog.com').then(function () {

                // next test
                return paths.urlForPost(settings, testData);
            }).then(function (url) {
                url.should.equal(postLink);

                // next test
                return paths.urlForPost(settings, testData, true);
            }).then(function (url) {
                url.should.equal('http://my-ghost-blog.com' + postLink);

                return paths.update('http://my-ghost-blog.com/blog');
            }).then(function () {

                // next test
                return paths.urlForPost(settings, testData);
            }).then(function (url) {
                url.should.equal('/blog' + postLink);

                // next test
                return paths.urlForPost(settings, testData, true);
            }).then(function (url) {
                url.should.equal('http://my-ghost-blog.com/blog' + postLink);

                done();
            }).then(null, done);
        });
    });
});