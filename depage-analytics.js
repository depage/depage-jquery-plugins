/**
 * @require framework/shared/jquery-1.4.2.js
 *
 * @file    depage-analytics.js
 *
 * abstracts asking for cookie consent and initialializing analytics if allowed
 *
 *
 * copyright (c) 2019 Frank Hellenkamp [jonas@depage.net]
 *
 * @author    Frank Hellenkamp [jonas@depage.net]
 **/
;(function($, w, config){
    if(!$.depage){
        $.depage = {};
    }

    var cookieName = config.cookieName || "privacy-policy-accepted";
    var lang = $('html').attr('lang');

    var startTracking = function() {
        Cookies.set(cookieName, "true", { expires: 30 * 24 * 60 * 60 }); // expires in 30 days

        if (config.matomo) {
            startMatomo();
        }
        if (config.ga) {
            startGoogleAnalytics();
        }
    }

    var startMatomo = function() {
        w._paq = w._paq || [];

        if (config.matomo.domain) {
            w._gaq.push(['_setDomainName', config.matomo.domain]);
        }
        w._paq.push(['trackPageView']);
        w._paq.push(['enableLinkTracking']);
        w._paq.push(['enableHeartBeatTimer']);
        w._paq.push(['setTrackerUrl', config.matomo.url + 'matomo.php']);
        w._paq.push(['setSiteId', config.matomo.siteId]);

        loadScript(config.matomo.url + 'matomo.js');
    }

    var startGoogleAnalytics = function() {
        loadScript('https://www.googletagmanager.com/gtag/js?id=' + config.ga.account);

        w.dataLayer = w.dataLayer || [];
        w.gtag = function(){
            w.dataLayer.push(arguments);
        }

        w.gtag('js', new Date());
        w.gtag('set', {
            'anonymize_ip': true,
            'allow_ad_personalization_signals': false
        });
        w.gtag('config', config.ga.account);
    }

    var loadScript = function(url) {
        var script = document.createElement('script'),
            el = document.getElementsByTagName('script')[0];

        script.type = 'text/javascript';
        script.async = true;
        script.defer = true;
        script.src = url;

        el.parentNode.insertBefore(script, el);
    }

    $.depage.analytics = function(el, options){
        // To avoid scope issues, use 'base' instead of 'this' to reference this class from internal events and functions.
        var base = this;

        // Access to jQuery and DOM versions of element
        base.$el = $(el);
        base.el = el;

        // Add a reverse reference to the DOM object
        base.$el.data("depage.analytics", base);

        base.init = function() {
            base.options = $.extend({},$.depage.analytics.defaultOptions, options);

            var $html = $("<div class=\"privacy-badger\"></div>");
            var $message = $("<p></p>");
            var $buttonWrapper = $("<div class=\"button-wrapper\"></div>");
            var $accept = $("<a></a>");
            var $cancel = $("<a></a>");

            $message
                .html(base.options.messageHtml.replace("{$privacyPolicyLink}", base.options.privacyPolicyLink))
                .appendTo($html);
            $buttonWrapper
                .appendTo($html);
            $accept
                .text(base.options.acceptText)
                .attr("class", "accept")
                .appendTo($buttonWrapper)
                .on("click", function() {
                    $html.remove();

                    startTracking();
                });
            $cancel
                .text(base.options.rejectText)
                .attr("class", "reject")
                .appendTo($buttonWrapper)
                .on("click", function() {
                    $html.remove();
                    Cookies.set(cookieName, "false", { expires: 30 * 24 * 60 * 60 }); // expires in 30 days
                });

            $html.appendTo(base.$el);
        };

        if (Cookies.get(cookieName) === "true" || Cookies.get(cookieName) === "false") {
            return;
        }

        // Run initializer
        base.init();
    };

    $.depage.analytics.defaultOptions = {
        messageHtml: "We use cookies and similar technologies to understand how you use our services and improve your experience. By clicking 'Accept', you accept all cookies. Otherwise we use only functionally essential cookies. For more information, please see our <a href=\"{$privacyPolicyLink}\">Data Protection Policy</a>",
        privacyPolicyLink: config.privacyPolicyLink || "",
        acceptText: "Accept cookies",
        rejectText: "Reject"
    };

    if (lang == "de") {
        $.depage.analytics.defaultOptions.messageHtml = "Um unseren Webauftritt für Sie optimal zu gestalten und fortlaufend verbessern zu können, verwenden wir Cookies. Wenn Sie 'Akzeptieren' klicken, stimmen Sie der Verwendung aller Cookies zu. Andernfalls verwenden wir nur funktionell unverzichtbare Cookies. Weitere Informationen, erhalten Sie in unserer <a href=\"{$privacyPolicyLink}\">Datenschutzerklärung für Webseitenbenutzer</a>.";
        $.depage.analytics.defaultOptions.acceptText = "Cookies akzeptieren";
        $.depage.analytics.defaultOptions.rejectText = "Ablehnen";
    }

    $.fn.depageAnalytics = function(options){
        return this.each(function(){
            (new $.depage.analytics(this, options));
        });
    };

    if (Cookies.get(cookieName) === "true") {
        startTracking();
    }
})(jQuery, window, depageAnalyticsConfig);
