"use strict";

Module.register("MMM-PublicTransportBerlin", {

    // default values
    defaults: {
        name: "MMM-PublicTransportBerlin",
        hidden: false,
        delay: 10,                      // How long do you need to walk to the next Station?
        interval: 120000,               // How often should the table be updated in ms?
        departureMinutes: 30,           // For how many minutes should departures be shown?
        showColoredLineSymbols: true,   // Want colored line symbols?
        useColorForRealtimeInfo: true,  // Want colored real time information (delay, early)?
        maxUnreachableDepartures: 3,    // How many unreachable departures should be shown?
        maxReachableDepartures: 7,      // How many reachable departures should be shown?
        fadeUnreachableDepartures: true,
        fadeReachableDepartures: true,
        fadePointForReachableDepartures: 0.5,
        stationId: 9160003
    },

    start: function () {
        Log.info("Starting module: " + this.name);

        this.departuresArray = [];
        this.stationName = "";
        this.loaded = false;
        this.firstReachableDepartureFound = false;

        this.sendSocketNotification('CREATE_FETCHER', this.config);

        setTimeout(() => {
            this.sendSocketNotification('GET_DEPARTURES', this.config.stationId);
        }, 1000);

        if(this.config.interval < 30000){
            this.config.interval = 30000;
        }
        setInterval(() => {
            this.sendSocketNotification('GET_DEPARTURES', this.config.stationId);
        }, this.config.interval)
    },

    getDom: function () {

        this.firstReachableDepartureFound = false;

        var wrapper = document.createElement("div");
        wrapper.className = "ptbWrapper";

        if (this.departuresArray.length === 0) {
            wrapper.innerHTML = (this.loaded) ? this.translate("EMPTY") : this.translate("LOADING");
            wrapper.className = "small light dimmed";
            return wrapper;
        }

        var heading = document.createElement("header");
        heading.innerHTML = this.stationName;
        wrapper.appendChild(heading);


        // table header
        var table = document.createElement("table");
        table.className = "ptbTable small light";

        var tHead = document.createElement("thead");

        var headerRow = document.createElement("tr");

        var headerTime = document.createElement("td");
        headerTime.innerHTML = "Abfahrt";
        headerRow.appendChild(headerTime);

        var delayTime = document.createElement("td");
        delayTime.innerHTML = "&nbsp;";
        headerRow.appendChild(delayTime);

        var headerLine = document.createElement("td");
        headerLine.innerHTML = "Linie";
        headerRow.appendChild(headerLine);

        var headerDirection = document.createElement("td");
        headerDirection.innerHTML = "Nach";
        headerRow.appendChild(headerDirection);

        headerRow.className = "bold dimmed";

        tHead.appendChild(headerRow);

        table.appendChild(tHead);

        // create table body from data
        var tBody = document.createElement("tbody");

        this.getFirstReachableDeparturePositionInArray().then((reachableDeparturePos) => {

            Log.log("getFirstReachableDeparturePositionInArray: " + reachableDeparturePos);

            this.departuresArray.forEach((current, i) => {

                if (i >= reachableDeparturePos - this.config.maxUnreachableDepartures
                    && i < reachableDeparturePos + this.config.maxReachableDepartures ) {

                    var currentWhen = moment(new Date(current.when));

                    if (i === reachableDeparturePos) {

                        var ruleRow = document.createElement("tr");

                        var ruleTimeCell = document.createElement("td");
                        ruleRow.appendChild(ruleTimeCell);

                        var ruleCell = document.createElement("td");
                        ruleCell.colSpan = 3;
                        ruleCell.className = "ruleCell";
                        ruleRow.appendChild(ruleCell);

                        tBody.appendChild(ruleRow);
                    }

                    var row = document.createElement("tr");

                    var timeCell = document.createElement("td");

                    timeCell.innerHTML = currentWhen.format("HH:mm");
                    row.appendChild(timeCell);

                    var delayCell = document.createElement("td");
                    delayCell.className = "delayTime";

                    var delay = Math.floor((((current.delay % 31536000) % 86400) % 3600) / 60);

                    if (delay > 0) {
                        delayCell.innerHTML = "+" + delay + " ";
                        if (this.config.useColorForRealtimeInfo)
                        {
                            delayCell.style.color = "red";
                        }
                    } else if (delay < 0) {
                        delayCell.innerHTML = delay + " ";
                        if (this.config.useColorForRealtimeInfo)
                        {
                            delayCell.style.color = "green";
                        }
                    } else if (delay === 0) {
                        delayCell.innerHTML = "";
                    }

                    row.appendChild(delayCell);

                    var lineCell = document.createElement("td");
                    var lineSymbol = this.getLineSymbol(current);

                    lineCell.appendChild(lineSymbol);
                    row.appendChild(lineCell);

                    var directionCell = document.createElement("td");
                    directionCell.innerHTML = current.direction;
                    row.appendChild(directionCell);

                    // fading for entries before "delay rule"
                    if (this.config.fadeUnreachableDepartures && this.config.delay > 0) {

                        var steps = this.config.maxUnreachableDepartures;

                        if (i >= reachableDeparturePos - steps && i < reachableDeparturePos) {
                            var currentStep = reachableDeparturePos - i;
                            row.style.opacity = 1 - ((1 / steps * currentStep) - 0.2);
                        }
                    }

                    // TODO: Look into that again! Not working properly...
                    // fading for entries after "delay rule"
                    if (this.config.fadeReachableDepartures && this.config.fadePointForReachableDepartures < 1) {
                        if (this.config.fadePointForReachableDepartures < 0) {
                            this.config.fadePointForReachableDepartures = 0;
                        }
                        var startingPoint = this.config.maxReachableDepartures * this.config.fadePointForReachableDepartures;
                        var steps = (reachableDeparturePos + this.config.maxReachableDepartures) - startingPoint;
                        if (i >= reachableDeparturePos + startingPoint) {
                            var currentStep = (i - reachableDeparturePos) - startingPoint;
                            row.style.opacity = 1 - (1 / steps * currentStep);
                        }
                    }

                    tBody.appendChild(row);
                }

            });
        });

        table.appendChild(tBody);

        wrapper.appendChild(table);

        return wrapper;
    },

    getFirstReachableDeparturePositionInArray: function () {
        let now = moment();
        let nowWithDelay = now.add(this.config.delay, 'minutes');

        return new Promise((resolve) => {
            this.departuresArray.forEach((current, i, depArray) => {
                if (i < depArray.length - 1) {
                    var currentWhen = moment(new Date(current.when));
                    var nextWhen = moment(new Date(depArray[i + 1].when));

                    if (!this.firstReachableDepartureFound && currentWhen.isBefore(nowWithDelay) && nextWhen.isSameOrAfter(nowWithDelay)) {
                        resolve(i);
                    }
                }
            })
        });
    },

    getLineSymbol: function (product) {
        var symbol = document.createElement('div');

        symbol.innerHTML = product.line;
        symbol.className = product.cssClass + " xsmall";

        if (this.config.showColoredLineSymbols) {
            symbol.style.backgroundColor = product.color;
        } else {
            symbol.style.backgroundColor = "#333333";
        }

        return symbol;
    },

    getStyles: function () {
        return ['style.css'];
    },

    getScripts: function () {
        return [
            "moment.js",
            this.file('./vendor/bluebird-3.4.5.min.js')
        ];
    },

    socketNotificationReceived: function (notification, payload) {

        if (notification === 'DEPARTURES') {
            if (payload.stationId === this.config.stationId) {
                this.stationName = payload.stationName;
                this.departuresArray = payload.departuresArray;
                this.updateDom(3000);
            }
        }
    }
});
