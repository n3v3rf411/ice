/*
 * Copyright 2013 Netflix, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var ice = angular.module('ice', ["ui"], function ($locationProvider) {
  $locationProvider.html5Mode(true);
});

ice.value('ui.config', {
  select2: {
  }
});

ice.factory('highchart', function () {
  var metricname = throughput_metricname;
  var metricunitname = throughput_metricunitname;
  var factoredCostCurrencySign = throughput_factoredCostCurrencySign;

  var hc_chart, consolidate = "hour", currencySign = global_currencySign, legends, showsps = false, factorsps = false;
  var hc_options = {
    chart: {
      renderTo: 'highchart_container',
      zoomType: 'x',
      spacingRight: 5,
      plotBorderWidth: 1
    },
    title: {
      style: { fontSize: '15px' }
    },
    xAxis: {
      type: 'datetime'
    },
    yAxis: {
      text: 'Cost Per Hour'
    },
    legend: {
      enabled: true
    },
    rangeSelector: {
      inputEnabled: false,
      enabled: false
    },
    series: [],
    credits: {
      enabled: false
    },
    plotOptions: {
      area: { lineWidth: 1, stacking: 'normal' },
      column: { lineWidth: 1, stacking: 'normal' },
      series: {
        states: {
          hover: {
            lineWidth: 2
          }
        },
        events: {
          //          mouseOver: function(event) {
          //            var i;
          //            for (i = 0; i < $scope.data.legend.length; i++) {
          //              $scope.data.legend[i].fontWeight = "font-weight: normal;";
          //            }
          //            $scope.data.legend[parseInt(this.name)].fontWeight = "font-weight: bold;";
          //            $scope.$apply();
          //          }
        }
      }
    },
    tooltip: {
      shared: true,
      formatter: function () {
        var s = '<span style="font-size: x-small;">' + Highcharts.dateFormat('%A, %b %e, %l%P, %Y', this.x) + '</span>';

        var total = 0;
        if (showsps) {
          for (var i = 0; i < this.points.length - (showsps ? 1 : 0); i++) {
            total += this.points[i].y;
          }
        }

        var precision = currencySign === "" ? 0 : (currencySign === "¢" ? 4 : 2);
        for (var i = 0; i < this.points.length - (showsps ? 1 : 0); i++) {
          var point = this.points[i];
          if (i == 0) {
            s += '<br/><span>aggregated : ' + currencySign + Highcharts.numberFormat(showsps ? total : point.total, precision, '.') + ' / ' + (factorsps ? metricunitname : consolidate);
          }
          var perc = showsps ? point.y * 100 / total : point.percentage;
          s += '<br/><span style="color: ' + point.series.color + '">' + point.series.name + '</span> : ' + currencySign + Highcharts.numberFormat(point.y, precision, '.') + ' / ' + (factorsps ? metricunitname : consolidate) + ' (' + Highcharts.numberFormat(perc, 1) + '%)';
          if (i > 40 && point)
            break;
        }

        return s;
      }
    }
  };

  var setupHcData = function (result, plotType, showsps, zeroDataValid) {

    Highcharts.setOptions({
      global: {
        useUTC: true
      }
    });

    hc_options.series = [];
    var i, j;
    for (i in result.data) {
      var data = result.data[i].data;
      var hasData = false;
      if (zeroDataValid) {
        // Don't filter out series with all zeros
        hasData = true;
      }
      else {
        for (j in data) {
          data[j] = parseFloat(data[j].toFixed(2));
          if (data[j] !== 0)
            hasData = true;
        }
      }

      if (hasData) {
        if (!result.interval && result.time) {
          for (j in data) {
            data[j] = [result.time[j], data[j]];
          }
        }
        var serie = {
          name: result.data[i].name,
          data: data,
          pointStart: result.start,
          pointInterval: result.interval,
          //step: true,
          type: plotType
        };

        hc_options.series.push(serie);
      }
    };

    if (showsps && result.sps && result.sps.length > 0) {
      var serie = {
        name: metricname,
        data: result.sps,
        pointStart: result.start,
        pointInterval: result.interval,
        //step: true,
        type: plotType,
        yAxis: 1
      };
      hc_options.series.push(serie);
    }
  }

  var setupYAxis = function (isCost, usageUnit, showsps, factorsps, elasticity, tagCoverage) {
    var unitStr = usageUnit === '' ? '' : ' (' + usageUnit + ')';
    var unitType = "";
    if (elasticity)
      unitType = '% Elasticity';
    else if (tagCoverage)
      unitType = '% Tag Coverage';
    else
      unitType = isCost ? 'Cost' : 'Usage' + unitStr;
    var yAxis = { title: { text: unitType + ' per ' + (factorsps ? metricunitname : consolidate) }, min: 0, lineWidth: 2 };
    if (isCost)
      yAxis.labels = {
        formatter: function () {
          return currencySign + this.value;
        }
      }
    hc_options.yAxis = [yAxis];

    if (showsps) {
      hc_options.yAxis.push({ title: { text: metricname }, height: 100, min: 0, lineWidth: 2, offset: 0 });
      hc_options.yAxis[0].top = 150;
      hc_options.yAxis[0].height = 350;
    }
  }

  return {
    dateFormat: function (time) {
      //y-MM-dd hha
      //return Highcharts.dateFormat('%A, %b %e, %l%P, %Y', this.x);
      return Highcharts.dateFormat('%Y-%m-%d %I%p', time);
    },

    monthFormat: function (time) {
      return Highcharts.dateFormat('%B', time);
    },

    dayFormat: function (time) {
      return Highcharts.dateFormat('%Y-%m-%d', time);
    },

    drawGraph: function (result, $scope, legendEnabled, elasticity, tagCoverage) {
      consolidate = $scope.consolidate === 'daily' ? 'day' : $scope.consolidate.substr(0, $scope.consolidate.length - 2);
      currencySign = $scope.usage_cost === 'cost' ? ($scope.factorsps ? factoredCostCurrencySign : global_currencySign) : "";
      hc_options.legend.enabled = legendEnabled;

      setupHcData(result, $scope.plotType, $scope.showsps, elasticity || tagCoverage);
      setupYAxis($scope.usage_cost === 'cost', $scope.usageUnit, $scope.showsps, $scope.factorsps, elasticity, tagCoverage);
      showsps = $scope.showsps;
      factorsps = $scope.factorsps;

      hc_chart = new Highcharts.StockChart(hc_options, function (chart) {
        if ($scope && $scope.legends) {
          var legend = { name: "aggregated" };
          if ($scope.stats && $scope.stats.aggregated)
            legend.stats = $scope.stats.aggregated;
          $scope.legends.push(legend);
        }
        var i = 0;
        for (i = 0; i < chart.series.length - ($scope.showsps ? 2 : 1); i++) {
          if ($scope && $scope.legends) {
            var legend = {
              name: chart.series[i].name,
              style: "color: " + chart.series[i].color,
              iconStyle: "background-color: " + chart.series[i].color,
              color: chart.series[i].color
            }
            if ($scope.stats && $scope.stats[chart.series[i].name])
              legend.stats = $scope.stats[chart.series[i].name];
            $scope.legends.push(legend);
          }
        }

        if ($scope) {
          legends = $scope.legends;
          $scope.loading = false;
        }

        var xextemes = chart.xAxis[0].getExtremes();
        Highcharts.addEvent(chart.container, 'dblclick', function (e) {
          chart.xAxis[0].setExtremes(xextemes.min, xextemes.max);
        });
      });
    },

    clickitem: function (legend) {
      if (legend.name === "aggregated")
        return;

      var series;
      for (var index = 0; index < hc_chart.series.length; index++) {
        if (hc_chart.series[index].name === legend.name) {
          series = hc_chart.series[index];
          series.setVisible(!series.visible);
          break;
        }
      }
      legend.style = series.visible ? "color: " + series.color : "color: rgb(192, 192, 192)";
      legend.iconStyle = series.visible ? "background-color: " + series.color : "color: rgb(192, 192, 192)";
    },

    showall: function () {
      for (var index = 0; index < hc_chart.series.length; index++) {
        hc_chart.series[index].setVisible(true, false);
      }
      hc_chart.redraw();
      for (var i in legends) {
        legends[i].style = "color: " + legends[i].color;
        legends[i].iconStyle = "background-color: " + legends[i].color;
      }
    },

    hideall: function () {
      for (var index = 0; index < hc_chart.series.length - 1; index++) {
        if (hc_chart.series[index].yAxis === 0 || hc_chart.series[index].yAxis.options.index === 0)
          hc_chart.series[index].setVisible(false, false);
      }
      hc_chart.redraw();
      for (var i in legends) {
        legends[i].style = "color: rgb(192, 192, 192)";
        legends[i].iconStyle = "background-color: rgb(192, 192, 192)";
      }
    }
  }
});

ice.factory('usage_db', function ($window, $http, $filter) {

  var graphonly = false;

  var retrieveNamesIfNotAll = function (array, selected, preselected, filter) {
    if (!selected && !preselected)
      return;

    var result = [];
    if (selected) {
      for (var i in selected)
        if (!filter || selected[i].name.toLowerCase().indexOf(filter.toLowerCase()) >= 0 || (filter[0] === "!" && selected[i].name.toLowerCase().indexOf(filter.slice(1).toLowerCase()) < 0))
          result.push(selected[i].name);
    }
    else {
      for (var i in preselected)
        if (!filter || preselected[i].toLowerCase().indexOf(filter.toLowerCase()) >= 0 || (filter[0] === "!" && selected[i].name.toLowerCase().indexOf(filter.slice(1).toLowerCase()) < 0))
          result.push(preselected[i]);
    }
    return result.join(",");
  }

  //  var addParams = function(params, name, array, selected, preselected) {
  //    var selected = retrieveNamesIfNotAll(array, selected, preselected);
  //    if (selected)
  //        params[name] = selected;
  //  }

  var getSelected = function (from, selected) {
    var result = [];
    for (var i in from) {
      if (selected.indexOf(from[i].name) >= 0)
        result.push(from[i]);
    }
    return result;
  }

  var updateSelected = function (from, selected) {
    var result = [];
    var selectedArr = [];
    for (var i in selected)
      selectedArr.push(selected[i].name);
    for (var i in from) {
      if (selectedArr.indexOf(from[i].name) >= 0)
        result.push(from[i]);
    }

    return result;
  }

  var timeParams = "";

  return {
    graphOnly: function () {
      return graphonly;
    },
    addParams: function (params, name, array, selected, preselected, filter) {
      var selected = retrieveNamesIfNotAll(array, selected, preselected, filter);
      if (selected)
        params[name] = selected;
    },

    updateUrl: function ($location, data) {
      var result = "";
      var time = "";
      for (var key in data) {
        if (result)
          result += "&";
        result += key + "=";

        if (typeof data[key] == "string") {
          result += data[key];

          if (key === "start" || key === "end") {
            if (time)
              time += "&";
            time += key + "=" + data[key];
          }
        }
        else {
          var selected = data[key].selected;
          for (var i in selected) {
            if (i != 0)
              result += ",";
            result += selected[i].name;
          }
          var filter = data[key].filter;
          if (filter)
            result += "&filter-" + key + "s=" + data[key].filter;
        }
      }

      $location.hash(result);

      if (time) {
        timeParams = time;
      }
    },

    getTimeParams: function () {
      return timeParams;
    },

    getParams: function (hash, $scope) {
      var result = {};
      if (hash) {
        var params = hash.split("&");
        for (i = 0; i < params.length; i++) {
          if (params[i].indexOf("=") < 0 && i > 0 && (params[i - 1].indexOf("appgroup=") == 0 || params[i - 1].indexOf("resourceGroup=") == 0))
            params[i - 1] = params[i - 1] + "&" + params[i];
        }
        var i, j, time = "";
        for (i = 0; i < params.length; i++) {

          if (params[i].indexOf("spans=") === 0) {
            $scope.spans = parseInt(params[i].substr(6));
          }
          else if (params[i].indexOf("graphOnly=true") === 0) {
            graphonly = true;
          }
          else if (params[i].indexOf("showResourceGroups=") === 0) {
            $scope.showResourceGroups = "true" === params[i].substr(19);
          }
          else if (params[i].indexOf("showResourceGroupTags=") === 0) {
            $scope.showResourceGroupTags = "true" === params[i].substr(22);
          }
          else if (params[i].indexOf("resources=") === 0) {
            $scope.resources = params[i].resources(10);
          }
          else if (params[i].indexOf("appgroup=") === 0) {
            $scope.appgroup = params[i].substr(9);
          }
          else if (params[i].indexOf("showZones=") === 0) {
            $scope.showZones = "true" === params[i].substr(10);
          }
          else if (params[i].indexOf("showsps=") === 0) {
            $scope.showsps = "true" === params[i].substr(8);
          }
          else if (params[i].indexOf("factorsps=") === 0) {
            $scope.factorsps = "true" === params[i].substr(10);
          }
          else if (params[i].indexOf("plotType=") === 0) {
            $scope.plotType = params[i].substr(9);
          }
          else if (params[i].indexOf("consolidate=") === 0) {
            $scope.consolidate = params[i].substr(12);
          }
          else if (params[i].indexOf("usage_cost=") === 0) {
            $scope.usage_cost = params[i].substr(11);
          }
          else if (params[i].indexOf("start=") === 0) {
            $scope.start = params[i].substr(6);
            if (time)
              time += "&";
            time += "start=" + $scope.start;
          }
          else if (params[i].indexOf("end=") === 0) {
            $scope.end = params[i].substr(4);
            if (time)
              time += "&";
            time += "end=" + $scope.end;
          }
          else if (params[i].indexOf("groupBy=") === 0) {
            var groupBy = params[i].substr(8);
            for (var j in $scope.groupBys) {
              if ($scope.groupBys[j].name === groupBy) {
                $scope.groupBy = $scope.groupBys[j];
                break;
              }
            }
          }
          else if (params[i].indexOf("account=") === 0) {
            $scope.selected__accounts = params[i].substr(8).split(",");
          }
          else if (params[i].indexOf("region=") === 0) {
            $scope.selected__regions = params[i].substr(7).split(",");
          }
          else if (params[i].indexOf("zone=") === 0) {
            $scope.selected__zones = params[i].substr(5).split(",");
          }
          else if (params[i].indexOf("product=") === 0) {
            $scope.selected__products = params[i].substr(8).split(",");
          }
          else if (params[i].indexOf("operation=") === 0) {
            $scope.selected__operations = params[i].substr(10).split(",");
          }
          else if (params[i].indexOf("usageType=") === 0) {
            $scope.selected__usageTypes = params[i].substr(10).split(",");
          }
          else if (params[i].indexOf("resourceGroup=") === 0) {
            $scope.selected__resourceGroups = params[i].substr(14).split(",");
          }
          else if (params[i].indexOf("tag=") === 0) {
            $scope.selected__tags = params[i].substr(4).split(",");
          }
          else if (params[i].indexOf("userTags=") === 0) {
            $scope.userTags = params[i].substr(18).split(",");
          }
          else if (params[i].indexOf("enabledUserTags=") === 0) {
            var enabled = params[i].substr(12).split(",");
            $scope.enabledUserTags = Array(enabled.length);
            for (j = 0; j < enabled.length; j++)
              $scope.enabledUserTags[j] = "true" === enabled[j];
          }
          else if (params[i].indexOf("filter-accounts=") === 0) {
            $scope.filter_accounts = params[i].substr(16);
          }
          else if (params[i].indexOf("filter-regions=") === 0) {
            $scope.filter_regions = params[i].substr(15);
          }
          else if (params[i].indexOf("filter-zones=") === 0) {
            $scope.filter_zones = params[i].substr(13);
          }
          else if (params[i].indexOf("filter-products=") === 0) {
            $scope.filter_products = params[i].substr(16);
          }
          else if (params[i].indexOf("filter-operations=") === 0) {
            $scope.filter_operations = params[i].substr(18);
          }
          else if (params[i].indexOf("filter-usageTypes=") === 0) {
            $scope.filter_usageTypes = params[i].substr(18);
          }
        }
        if ($scope.showResourceGroupTags) {
          $scope.filter_userTagValues = Array($scope.userTags.length);
          $scope.selected__userTagValues = Array($scope.userTags.length);
          for (i = 0; i < params.length; i++) {
            if (params[i].indexOf("tag-") === 0) {
              var parts = params[i].substr(4).split("=");
              for (j = 0; j < $scope.userTags.length; j++) {
                if ($scope.userTags[j] === parts[0]) {
                  $scope.selected__userTagValues[j] = parts[1].split(",");
                }
              }
            }
            else if (params[i].indexOf("filter-tag-") === 0) {
              var parts = params[i].substr(11).split("=");
              for (j = 0; j < $scope.userTags.length; j++) {
                if ($scope.userTags[j] === parts[0]) {
                  $scope.filter_userTagValues[j] = parts[1];
                }
              }
            }
          }
        }
      }
      if (!$scope.showResourceGroups) {
        for (var j in $scope.groupBys) {
          if ($scope.groupBys[j].name === "ResourceGroup") {
            $scope.groupBys.splice(j, 1);
            break;
          }
        }
      }
      if (!$scope.showResourceGroupTags && !$scope.tagCoverage) {
        for (var j in $scope.groupBys) {
          if ($scope.groupBys[j].name === "Tag") {
            $scope.groupBys.splice(j, 1);
            break;
          }
        }
      }
      var toRemove = $scope.showZones ? "Region" : "Zone";
      for (var j in $scope.groupBys) {
        if ($scope.groupBys[j].name === toRemove) {
          $scope.groupBys.splice(j, 1);
          break;
        }
      }

      if (time) {
        timeParams = time;
      }
      return result;
    },

    getAccounts: function ($scope, fn, params) {
      if (!params) {
        params = {};
      }
      $http({
        method: "GET",
        url: "getAccounts",
        params: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.accounts = result.data;
          if ($scope.selected__accounts && !$scope.selected_accounts)
            $scope.selected_accounts = getSelected($scope.accounts, $scope.selected__accounts);
          else
            $scope.selected_accounts = $scope.accounts;
          if (fn)
            fn(result.data);
        }
      });
    },

    getRegions: function ($scope, fn, params) {
      if (!params) {
        params = {};
        this.addParams(params, "account", $scope.accounts, $scope.selected_accounts);
      }
      $http({
        method: "GET",
        url: "getRegions",
        params: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.regions = result.data;
          if ($scope.selected__regions && !$scope.selected_regions)
            $scope.selected_regions = getSelected($scope.regions, $scope.selected__regions);
          else if (!$scope.selected_regions) {
            $scope.selected_regions = $scope.regions;
          }
          else if ($scope.selected_regions.length > 0) {
            $scope.selected_regions = updateSelected($scope.regions, $scope.selected_regions);
          }
          if (fn)
            fn(result.data);
        }
      });
    },

    getZones: function ($scope, fn, params) {
      if (!params) {
        params = {};
        this.addParams(params, "account", $scope.accounts, $scope.selected_accounts);
      }
      $http({
        method: "GET",
        url: "getZones",
        params: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.zones = result.data;
          if ($scope.selected__zones && !$scope.selected_zones)
            $scope.selected_zones = getSelected($scope.zones, $scope.selected__zones);
          else if (!$scope.selected_zones)
            $scope.selected_zones = $scope.zones;
          else if ($scope.selected_zones.length > 0)
            $scope.selected_zones = updateSelected($scope.zones, $scope.selected_zones);
          if (fn)
            fn(result.data);
        }
      });
    },

    getProducts: function ($scope, fn, params) {
      if (!params) {
        params = {};
        this.addParams(params, "account", $scope.accounts, $scope.selected_accounts);
        this.addParams(params, "region", $scope.regions, $scope.selected_regions);

        if ($scope.showResourceGroups || $scope.resources) {
          params.resources = true;
        }
        if ($scope.showAppGroups) {
          params.showAppGroups = true;
        }
      }

      $http({
        method: "GET",
        url: "getProducts",
        params: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.products = result.data;
          if ($scope.selected__products && !$scope.selected_products)
            $scope.selected_products = getSelected($scope.products, $scope.selected__products);
          else if (!$scope.selected_products)
            $scope.selected_products = $scope.products;
          else if ($scope.selected_products.length > 0)
            $scope.selected_products = updateSelected($scope.products, $scope.selected_products);
          if (fn)
            fn(result.data);
        }
      });
    },

    getResourceGroups: function ($scope, fn, params) {
      if (!params) {
        params = {};
        this.addParams(params, "account", $scope.accounts, $scope.selected_accounts);
        this.addParams(params, "region", $scope.regions, $scope.selected_regions);
        this.addParams(params, "product", $scope.regions, $scope.selected_products);
      }
      $http({
        method: "GET",
        url: "getResourceGroups",
        params: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.resourceGroups = result.data;
          if ($scope.selected__resourceGroups && !$scope.selected_resourceGroups)
            $scope.selected_resourceGroups = getSelected($scope.resourceGroups, $scope.selected__resourceGroups);
          else if (!$scope.selected_resourceGroups)
            $scope.selected_resourceGroups = $scope.resourceGroups;
          else if ($scope.selected_resourceGroups.length > 0)
            $scope.selected_resourceGroups = updateSelected($scope.resourceGroups, $scope.selected_resourceGroups);
          if (fn)
            fn(result.data);
        }
      });
    },

    getUserTags: function ($scope, fn, params) {
      if (!params)
        params = {}
      $http({
        method: "GET",
        url: "userTags",
        params: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.userTags = result.data;
          if (fn)
            fn(result.data);
        }
      });
    },

    getUserTagValues: function ($scope, index, fn, params) {
      if (!params) {
        params = {};
        params.index = index;
        this.addParams(params, "account", $scope.accounts, $scope.selected_accounts);
        this.addParams(params, "region", $scope.regions, $scope.selected_regions);
        this.addParams(params, "product", $scope.regions, $scope.selected_products);
      }
      $http({
        method: "GET",
        url: "userTagValues",
        params: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.userTagValues[index] = result.data;
          if ($scope.selected__userTagValues[index] && !$scope.selected_userTagValues[index])
            $scope.selected_userTagValues[index] = getSelected($scope.userTagValues[index], $scope.selected__userTagValues[index]);
          else if (!$scope.selected_userTagValues[index])
            $scope.selected_userTagValues[index] = $scope.userTagValues[index];
          else if ($scope.selected_userTagValues[index].length > 0)
            $scope.selected_userTagValues[index] = updateSelected($scope.userTagValues[index], $scope.selected_userTagValues[index]);
          if (fn)
            fn(result.data);
        }
      });
    },

    getOperations: function ($scope, fn, params) {
      if (!params) {
        params = {};
        this.addParams(params, "account", $scope.accounts, $scope.selected_accounts);
        this.addParams(params, "region", $scope.regions, $scope.selected_regions);
        this.addParams(params, "product", $scope.products, $scope.selected_products);
        if ($scope.showResourceGroups) {
          this.addParams(params, "resourceGroup", $scope.resourceGroups, $scope.selected_resourceGroups);
          params.resources = true;
        }
      }
      $http({
        method: "POST",
        url: "getOperations",
        data: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.operations = result.data;
          if ($scope.selected__operations && !$scope.selected_operations)
            $scope.selected_operations = getSelected($scope.operations, $scope.selected__operations);
          else if (!$scope.selected_operations)
            $scope.selected_operations = $scope.operations;
          else if ($scope.selected_operations.length > 0)
            $scope.selected_operations = updateSelected($scope.operations, $scope.selected_operations);
          if (fn)
            fn(result.data);
        }
      });
    },

    getUsageTypes: function ($scope, fn, params) {
      if (!params) {
        params = {};
        this.addParams(params, "account", $scope.accounts, $scope.selected_accounts);
        this.addParams(params, "region", $scope.regions, $scope.selected_regions);
        this.addParams(params, "product", $scope.products, $scope.selected_products);
        this.addParams(params, "operation", $scope.operations, $scope.selected_operations);
        if ($scope.showResourceGroups)
          this.addParams(params, "resourceGroup", $scope.resourceGroups, $scope.selected_resourceGroups);
        if ($scope.showResourceGroups || $scope.resources)
          params.resources = true;
      }
      $http({
        method: "POST",
        url: "getUsageTypes",
        data: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.usageTypes = result.data;
          if ($scope.selected__usageTypes && !$scope.selected_usageTypes)
            $scope.selected_usageTypes = getSelected($scope.usageTypes, $scope.selected__usageTypes);
          else if (!$scope.selected_usageTypes)
            $scope.selected_usageTypes = $scope.usageTypes;
          else if ($scope.selected_usageTypes.length > 0)
            $scope.selected_usageTypes = updateSelected($scope.usageTypes, $scope.selected_usageTypes);
          if (fn)
            fn(result.data);
        }
      });
    },

    getReservationOps: function ($scope, fn, params) {
      if (!params) {
        params = {};
      }
      $http({
        method: "GET",
        url: "getReservationOps",
        params: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.reservationOps = result.data;
        }
        if (fn)
          fn(result.data);
      });
    
    },

    getUtilizationOps: function ($scope, fn, params) {
      if (!params) {
        params = {};
      }
      $http({
        method: "GET",
        url: "getUtilizationOps",
        params: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.utilizationOps = result.data;
        }
        if (fn)
          fn(result.data);
      });    
    },

    getTags: function ($scope, fn, params) {
      if (!params) {
        params = {};
      }
      $http({
        method: "GET",
        url: "tags",
        params: params
      }).success(function (result) {
        if (result.status === 200 && result.data) {
          $scope.tags = result.data;
          if ($scope.selected__tags && !$scope.selected_tags)
            $scope.selected_tags = getSelected($scope.tags, $scope.selected__tags);
          else
            $scope.selected_tags = $scope.tags;
          if (fn)
            fn(result.data);
        }
      });
    },

    getData: function ($scope, fn, params, download) {
      if (!params)
        params = {};
      params = jQuery.extend({
        isCost: $scope.usage_cost === "cost",
        usageUnit: $scope.usageUnit,
        aggregate: "stats",
        groupBy: $scope.groupBy.name,
        consolidate: $scope.consolidate,
        start: $scope.start,
        end: $scope.end,
        breakdown: false,
        showsps: $scope.showsps ? true : false,
        factorsps: $scope.factorsps ? true : false,
        family: $scope.family ? true : false,
        tagCoverage: $scope.tagCoverage ? true : false,
      }, params);
      this.addParams(params, "account", $scope.accounts, $scope.selected_accounts, $scope.selected__accounts, $scope.filter_accounts);
      if ($scope.showZones)
        this.addParams(params, "zone", $scope.zones, $scope.selected_zones, $scope.selected__zones, $scope.filter_zones);
      else
        this.addParams(params, "region", $scope.regions, $scope.selected_regions, $scope.selected__regions, $scope.filter_regions);
      this.addParams(params, "product", $scope.products, $scope.selected_products, $scope.selected__products, $scope.filter_products);
      this.addParams(params, "operation", $scope.operations, $scope.selected_operations, $scope.selected__operations, $scope.filter_operations);
      this.addParams(params, "usageType", $scope.usageTypes, $scope.selected_usageTypes, $scope.selected__usageTypes, $scope.filter_usageTypes);
      if ($scope.tagCoverage)
        this.addParams(params, "tag", $scope.tags, $scope.selected_tags, $scope.selected__tags, $scope.filter_tags);
      if ($scope.showResourceGroups && !params.breakdown) {
        params.showResourceGroups = true;
        this.addParams(params, "resourceGroup", $scope.resourceGroups, $scope.selected_resourceGroups, $scope.selected__resourceGroups, $scope.filter_resourceGroups);
      }
      if ($scope.showResourceGroupTags) {
        params.showResourceGroupTags = true;
        if ($scope.groupBy.name === 'Tag')
          params.groupByTag = $scope.groupByTag.name;
        for (var i = 0; i < $scope.userTags.length; i++) {
          if ($scope.enabledUserTags[i]) {
            this.addParams(params, "tag-" + $scope.userTags[i].name, $scope.userTagValues[i], $scope.selected_userTagValues[i], $scope.selected__userTagValues[i], $scope.filter_userTagValues[i]);
          }
        }
      }
      if ($scope.appgroup) {
        params.appgroup = $scope.appgroup;
      }

      if (!download) {
        $http({
          method: "POST",
          url: "getData",
          data: params
        }).success(function (result) {
          if (result.status === 200 && result.data && fn) {
            fn(result);
          }
        });
      }
      else {
        jQuery("#download_form").empty();

        if ($scope.appgroup) {
          params.appgroup = $filter('json')($scope.appgroup);
        }
        for (var key in params) {
          jQuery("<input type='text' />")
            .attr("id", key)
            .attr("name", key)
            .attr("value", params[key])
            .appendTo(jQuery("#download_form"));
        }

        jQuery("#download_form").submit();
      }
    },

    reverse: function (date) {
      var copy = [].concat(date);
      return copy.reverse();
    }
  };
});

function mainCtrl($scope, $location, $timeout, usage_db, highchart) {
  $scope.currencySign = global_currencySign;

  window.onhashchange = function () {
    window.location.reload();
  }

  var pageLoaded = false;
  $scope.$watch(function () { return $location.path(); }, function (locationPath) {
    if (pageLoaded)
      $timeout(function () { location.reload() });
    else
      pageLoaded = true;
  });

  $scope.throughput_metricname = throughput_metricname;

  $scope.getTimeParams = function () {
    return usage_db.getTimeParams();
  }

  $scope.reload = function () {
    $timeout(function () { location.reload() });
  }

  $scope.dateFormat = function (time) {
    return highchart.dateFormat(time);
  }

  $scope.monthFormat = function (time) {
    return highchart.monthFormat(time);
  }

  $scope.dayFormat = function (time) {
    return highchart.dayFormat(time);
  }

  $scope.getConsolidateName = function (consolidate) {
    if (consolidate === 'weekly')
      return "week";
    else if (consolidate == 'monthly')
      return "month";
    else
      return "";
  }

  $scope.clickitem = function (legend) {
    highchart.clickitem(legend);
  }

  $scope.showall = function () {
    highchart.showall();
  }

  $scope.hideall = function () {
    highchart.hideall();
  }

  $scope.getTrClass = function (index) {
    return index % 2 == 0 ? "even" : "odd";
  }

  $scope.order = function (data, name, stats) {

    if ($scope.predicate != name) {
      $scope.reservse = name === 'name';
      $scope.predicate = name;
    }
    else {
      $scope.reservse = !$scope.reservse;
    }

    var compare = function (a, b) {
      if (!stats) {
        if (a[name] < b[name])
          return !$scope.reservse ? 1 : -1;
        if (a[name] > b[name])
          return !$scope.reservse ? -1 : 1;
        return 0;
      }
      else {
        if (a.stats[name] < b.stats[name])
          return !$scope.reservse ? 1 : -1;
        if (a.stats[name] > b.stats[name])
          return !$scope.reservse ? -1 : 1;
        return 0;
      }
    }
    data.sort(compare);
  }

  $scope.graphOnly = function () {
    return usage_db.graphOnly();
  }

  $scope.getBodyWidth = function (defaultWidth) {
    return usage_db.graphOnly() ? "" : defaultWidth;
  }
}

function reservationCtrl($scope, $location, $http, usage_db, highchart) {

  var predefinedQuery = {};
  $scope.legends = [];
  $scope.usage_cost = "cost";
  $scope.usageUnit = "Instances";
  $scope.groupBys = [
    { name: "Account" },
    { name: "Region" },
    { name: "Zone" },
    { name: "Product" },
    { name: "Operation" },
    { name: "UsageType" }
  ];
  $scope.showsps = false;
  $scope.factorsps = false;
  $scope.groupBy = $scope.groupBys[4];
  $scope.family = false;
  $scope.consolidate = "hourly";
  $scope.showZones = false;
  $scope.plotType = 'area';
  $scope.end = new Date();
  $scope.start = new Date();
  var startMonth = $scope.end.getUTCMonth() - 1;
  var startYear = $scope.end.getUTCFullYear();
  if (startMonth < 0) {
    startMonth += 12;
    startYear -= 1;
  }
  $scope.start.setUTCFullYear(startYear);
  $scope.start.setUTCMonth(startMonth);
  $scope.start.setUTCDate(1);
  $scope.start.setUTCHours(0);

  $scope.end = highchart.dateFormat($scope.end); //$filter('date')($scope.end, "y-MM-dd hha");
  $scope.start = highchart.dateFormat($scope.start); //$filter('date')($scope.start, "y-MM-dd hha");

  $scope.updateUrl = function () {
    $scope.end = jQuery('#end').datetimepicker().val();
    $scope.start = jQuery('#start').datetimepicker().val();
    var params = {
      usage_cost: $scope.usage_cost,
      start: $scope.start,
      end: $scope.end,
      groupBy: $scope.groupBy.name,
      family: "" + $scope.family,
      showZones: "" + $scope.showZones,
      consolidate: $scope.consolidate,
      plotType: $scope.plotType,
      showsps: "" + $scope.showsps,
      factorsps: "" + $scope.factorsps,
      account: { selected: $scope.selected_accounts, from: $scope.accounts, filter: $scope.filter_accounts },
      product: { selected: $scope.selected_products, from: $scope.products, filter: $scope.filter_products },
      operation: { selected: $scope.selected_operations, from: $scope.operations, filter: $scope.filter_operations },
      usageType: { selected: $scope.selected_usageTypes, from: $scope.usageTypes, filter: $scope.filter_usageTypes }
    };
    if ($scope.showZones)
      params.zone = { selected: $scope.selected_zones, from: $scope.zones };
    else
      params.region = { selected: $scope.selected_regions, from: $scope.regions };
    usage_db.updateUrl($location, params);
  }

  $scope.download = function () {
    var query = { operation: $scope.reservationOps.join(","), forReservation: true };
    if ($scope.showZones)
      query.showZones = true;
    usage_db.getData($scope, null, query, true);
  }

  $scope.getData = function () {
    $scope.loading = true;
    var query = { operation: $scope.reservationOps.join(","), forReservation: true };
    if ($scope.showZones)
      query.showZones = true;
    usage_db.getData($scope, function (result) {
      var hourlydata = [];
      for (var key in result.data) {
        hourlydata.push({ name: key, data: result.data[key] });
      }
      result.data = hourlydata;
      $scope.legends = [];
      $scope.stats = result.stats;
      highchart.drawGraph(result, $scope);

      $scope.legendPrecision = $scope.usage_cost == "cost" ? 2 : 0;
      $scope.legendName = $scope.groupBy.name;
      $scope.legend_usage_cost = $scope.usage_cost;
    }, query);
  }

  $scope.productsChanged = function () {
    updateOperations();
    updateUsageTypes();
  }

  $scope.usageCostChanged = function () {
    updateOperations();
  }

  var updateOperations = function () {
    var query = jQuery.extend({ usage_cost: $scope.usage_cost, forReservation: true }, predefinedQuery);
    usage_db.addParams(query, "product", $scope.products, $scope.selected_products, $scope.selected__products);
    usage_db.getOperations($scope, null, query);
  }

  var updateUsageTypes = function () {
    var query = jQuery.extend({ usage_cost: $scope.usage_cost }, predefinedQuery);
    usage_db.addParams(query, "product", $scope.products, $scope.selected_products, $scope.selected__products);
    usage_db.getUsageTypes($scope, null, query);
  }

  var fn = function () {
    predefinedQuery = { operation: $scope.reservationOps.join(",") };

    usage_db.getParams($location.hash(), $scope);

    usage_db.getAccounts($scope, null, {});
    if ($scope.showZones)
      usage_db.getZones($scope, null, {});
    else
      usage_db.getRegions($scope, null, {});

    var query = $scope.showZones ? jQuery.extend({ showZones: true }, predefinedQuery) : predefinedQuery;
    usage_db.getProducts($scope, function () {
      updateOperations();
      updateUsageTypes();
    }, query);

    $scope.getData();

    jQuery("#start, #end").datetimepicker({
      showTime: false,
      showMinute: false,
      ampm: true,
      timeFormat: 'hhTT',
      dateFormat: 'yy-mm-dd'
    });
    jQuery('#end').datetimepicker().val($scope.end);
    jQuery('#start').datetimepicker().val($scope.start);
  }

  usage_db.getReservationOps($scope, fn);
}

function tagCoverageCtrl($scope, $location, $http, usage_db, highchart) {
  $scope.showsps = false;
  $scope.factorsps = false;
  $scope.showResourceGroups = false;
  $scope.resources = true; // limit products, operations, and usageTypes to those that have tagged resources
  $scope.plotType = "line";
  $scope.legends = [];
  $scope.usage_cost = "";
  $scope.usageUnit = "";
  $scope.tagCoverage = true;
  $scope.groupBys = [
    { name: "None" },
    { name: "Tag" },
    { name: "Account" },
    { name: "Region" },
    { name: "Product" },
    { name: "ResourceGroup" },
    { name: "Operation" },
    { name: "UsageType" }
  ],
    $scope.groupBy = $scope.groupBys[1];
  $scope.consolidate = "hourly";
  $scope.end = new Date();
  $scope.start = new Date();
  var startMonth = $scope.end.getUTCMonth() - 1;
  var startYear = $scope.end.getUTCFullYear();
  if (startMonth < 0) {
    startMonth += 12;
    startYear -= 1;
  }
  $scope.start.setUTCFullYear(startYear);
  $scope.start.setUTCMonth(startMonth);
  $scope.start.setUTCDate(1);
  $scope.start.setUTCHours(0);

  $scope.end = highchart.dateFormat($scope.end); //$filter('date')($scope.end, "y-MM-dd hha");
  $scope.start = highchart.dateFormat($scope.start); //$filter('date')($scope.start, "y-MM-dd hha");

  $scope.updateUrl = function () {
    $scope.end = jQuery('#end').datetimepicker().val();
    $scope.start = jQuery('#start').datetimepicker().val();
    var params = {
      usage_cost: $scope.usage_cost,
      start: $scope.start,
      end: $scope.end,
      groupBy: $scope.groupBy.name,
      showResourceGroups: "" + $scope.showResourceGroups,
      resources: "" + $scope.productsWithResources,
      consolidate: $scope.consolidate,
      plotType: $scope.plotType,
      showsps: "" + $scope.showsps,
      factorsps: "" + $scope.factorsps,
      tagCoverage: "" + $scope.tagCoverage,
      account: { selected: $scope.selected_accounts, from: $scope.accounts, filter: $scope.filter_accounts },
      region: { selected: $scope.selected_regions, from: $scope.regions, filter: $scope.filter_regions },
      product: { selected: $scope.selected_products, from: $scope.products, filter: $scope.filter_products },
      operation: { selected: $scope.selected_operations, from: $scope.operations, filter: $scope.filter_operations },
      usageType: { selected: $scope.selected_usageTypes, from: $scope.usageTypes, filter: $scope.filter_usageTypes },
      tags: { selected: $scope.selected_tags, from: $scope.tags }
    };
    usage_db.updateUrl($location, params);
  }

  $scope.download = function () {
    usage_db.getData($scope, null, null, true);
  }

  $scope.getData = function () {
    $scope.loading = true;
    usage_db.getData($scope, function (result) {
      var hourlydata = [];
      for (var key in result.data) {
        hourlydata.push({ name: key, data: result.data[key] });
      }
      result.data = hourlydata;
      $scope.legends = [];
      $scope.stats = result.stats;
      highchart.drawGraph(result, $scope, false, false, true);

      $scope.legendName = $scope.groupBy.name;
      $scope.legend_usage_cost = $scope.usage_cost;
    });
  }

  $scope.accountsChanged = function () {
    $scope.updateRegions();
  }

  $scope.regionsChanged = function () {
    $scope.updateProducts();
  }

  $scope.productsChanged = function () {
    $scope.updateOperations();
  }

  $scope.resourceGroupsChanged = function () {
    $scope.updateOperations();
  }

  $scope.operationsChanged = function () {
    $scope.updateUsageTypes();
  }

  $scope.updateUsageTypes = function () {
    usage_db.getUsageTypes($scope, function (data) {
    });
  }

  $scope.updateOperations = function () {
    usage_db.getOperations($scope, function (data) {
      $scope.updateUsageTypes();
    });
  }

  $scope.updateProducts = function () {
    usage_db.getProducts($scope, function (data) {
      $scope.updateOperations();
    });
  }

  $scope.updateRegions = function () {
    usage_db.getRegions($scope, function (data) {
      $scope.updateProducts();
    });
  }

  $scope.updateAccounts = function () {
    usage_db.getAccounts($scope, function (data) {
      $scope.updateRegions();
    });
  }

  usage_db.getParams($location.hash(), $scope);

  var fn = function () {
    usage_db.getTags($scope, function (data) {
      $scope.getData();
    });

    usage_db.getAccounts($scope, function (data) {
      $scope.updateRegions();
    });

    jQuery("#start, #end").datetimepicker({
      showTime: false,
      showMinute: false,
      ampm: true,
      timeFormat: 'hhTT',
      dateFormat: 'yy-mm-dd'
    });
    jQuery('#end').datetimepicker().val($scope.end);
    jQuery('#start').datetimepicker().val($scope.start);
  }

  fn();
}

function utilizationCtrl($scope, $location, $http, usage_db, highchart) {

  var predefinedQuery = {};
  $scope.legends = [];
  $scope.usage_cost = "usage";
  $scope.usageUnit = "ECUs";
  $scope.groupBys = [
    { name: "Account" },
    { name: "Region" },
    { name: "Zone" },
    { name: "Product" },
    { name: "Operation" },
    { name: "UsageType" }
  ];
  $scope.showsps = false;
  $scope.factorsps = false;
  $scope.groupBy = $scope.groupBys[0];
  $scope.consolidate = "daily";
  $scope.showZones = false;
  $scope.plotType = 'line';
  $scope.end = new Date();
  $scope.start = new Date();
  var startMonth = $scope.end.getUTCMonth() - 1;
  var startYear = $scope.end.getUTCFullYear();
  if (startMonth < 0) {
    startMonth += 12;
    startYear -= 1;
  }
  $scope.start.setUTCFullYear(startYear);
  $scope.start.setUTCMonth(startMonth);
  $scope.start.setUTCDate(1);
  $scope.start.setUTCHours(0);

  $scope.end.setUTCHours(0);
  $scope.start.setUTCHours(0);
  $scope.end = highchart.dateFormat($scope.end); //$filter('date')($scope.end, "y-MM-dd hha");
  $scope.start = highchart.dateFormat($scope.start); //$filter('date')($scope.start, "y-MM-dd hha");

  $scope.updateUrl = function () {
    $scope.end = jQuery('#end').datetimepicker().val();
    $scope.start = jQuery('#start').datetimepicker().val();
    var params = {
      usage_cost: $scope.usage_cost,
      start: $scope.start,
      end: $scope.end,
      groupBy: $scope.groupBy.name,
      showZones: "" + $scope.showZones,
      consolidate: $scope.consolidate,
      plotType: "line",
      showsps: "" + $scope.showsps,
      factorsps: "" + $scope.factorsps,
      account: { selected: $scope.selected_accounts, from: $scope.accounts, filter: $scope.filter_accounts },
      product: { selected: $scope.selected_products, from: $scope.products, filter: $scope.filter_products },
      operation: { selected: $scope.selected_operations, from: $scope.operations, filter: $scope.filter_operations },
      usageType: { selected: $scope.selected_usageTypes, from: $scope.usageTypes, filter: $scope.filter_usageTypes }
    };
    if ($scope.showZones)
      params.zone = { selected: $scope.selected_zones, from: $scope.zones };
    else
      params.region = { selected: $scope.selected_regions, from: $scope.regions };
    usage_db.updateUrl($location, params);
  }

  $scope.download = function () {
    var query = { operation: utilizationOps.join(","), forReservation: true, elasticity: true };
    if ($scope.showZones)
      query.showZones = true;
    usage_db.getData($scope, null, query, true);
  }

  $scope.getData = function () {
    $scope.loading = true;
    var query = { operation: $scope.utilizationOps.join(","), forReservation: true, elasticity: true };
    if ($scope.showZones)
      query.showZones = true;

    usage_db.getData($scope, function (result) {
      var dailyData = [];
      for (var key in result.data) {
        dailyData.push({ name: key, data: result.data[key] });
      }
      result.data = dailyData;
      $scope.legends = [];
      $scope.stats = result.stats;
      highchart.drawGraph(result, $scope, false, true, false);

      $scope.legendPrecision = 0;
      $scope.legendName = $scope.groupBy.name;
      $scope.legend_usage_cost = $scope.usage_cost;
    }, query);
  }

  $scope.productsChanged = function () {
    updateOperations();
    updateUsageTypes();
  }

  var updateOperations = function () {
    var query = jQuery.extend({ usage_cost: $scope.usage_cost, forReservation: true }, predefinedQuery);
    usage_db.addParams(query, "product", $scope.products, $scope.selected_products, $scope.selected__products);
    usage_db.getOperations($scope, null, query);
  }

  var updateUsageTypes = function () {
    var query = jQuery.extend({ usage_cost: $scope.usage_cost }, predefinedQuery);
    usage_db.addParams(query, "product", $scope.products, $scope.selected_products, $scope.selected__products);
    usage_db.getUsageTypes($scope, null, query);
  }

  var fn = function (data) {
    predefinedQuery = { operation: $scope.utilizationOps.join(",") };
    usage_db.getParams($location.hash(), $scope);

    usage_db.getAccounts($scope, null, {});
    if ($scope.showZones)
      usage_db.getZones($scope, null, {});
    else
      usage_db.getRegions($scope, null, {});

    var query = $scope.showZones ? jQuery.extend({ showZones: true }, predefinedQuery) : predefinedQuery;
    usage_db.getProducts($scope, function () {
      updateOperations();
      updateUsageTypes();
    }, query);

    $scope.getData();

    jQuery("#start, #end").datetimepicker({
      showTime: false,
      showMinute: false,
      ampm: true,
      timeFormat: 'hhTT',
      dateFormat: 'yy-mm-dd'
    });
    jQuery('#end').datetimepicker().val($scope.end);
    jQuery('#start').datetimepicker().val($scope.start);
  }

  usage_db.getUtilizationOps($scope, fn);
}

function detailCtrl($scope, $location, $http, usage_db, highchart) {

  $scope.showsps = false;
  $scope.factorsps = false;
  $scope.showResourceGroups = false;
  $scope.enabledUserTags = [];
  $scope.userTags = [];
  $scope.userTagValues = [];
  $scope.selected_userTagValues = [];
  $scope.selected__userTagValues = [];
  $scope.filter_userTagValues = [];
  $scope.plotType = "area";
  $scope.legends = [];
  $scope.usage_cost = "cost";
  $scope.usageUnit = "";
  $scope.groupBys = [
    { name: "None" },
    { name: "Account" },
    { name: "Region" },
    { name: "Product" },
    { name: "ResourceGroup" },
    { name: "Operation" },
    { name: "UsageType" },
    { name: "Tag" }
  ],
    $scope.groupBy = $scope.groupBys[2];
    $scope.groupByTag = {}
  $scope.groupByTags = []
  $scope.consolidate = "hourly";
  $scope.end = new Date();
  $scope.start = new Date();
  var startMonth = $scope.end.getUTCMonth() - 1;
  var startYear = $scope.end.getUTCFullYear();
  if (startMonth < 0) {
    startMonth += 12;
    startYear -= 1;
  }
  $scope.start.setUTCFullYear(startYear);
  $scope.start.setUTCMonth(startMonth);
  $scope.start.setUTCDate(1);
  $scope.start.setUTCHours(0);

  $scope.end = highchart.dateFormat($scope.end); //$filter('date')($scope.end, "y-MM-dd hha");
  $scope.start = highchart.dateFormat($scope.start); //$filter('date')($scope.start, "y-MM-dd hha");

  $scope.isGroupByTag = function () {
    return $scope.groupBy.name === 'Tag';
  }
  
  $scope.updateUrl = function () {
    $scope.end = jQuery('#end').datetimepicker().val();
    $scope.start = jQuery('#start').datetimepicker().val();
    var params = {
      usage_cost: $scope.usage_cost,
      start: $scope.start,
      end: $scope.end,
      groupBy: $scope.groupBy.name,
      showResourceGroups: "" + $scope.showResourceGroups,
      showResourceGroupTags: "" + $scope.showResourceGroupTags,
      consolidate: $scope.consolidate,
      plotType: $scope.plotType,
      showsps: "" + $scope.showsps,
      factorsps: "" + $scope.factorsps,
      account: { selected: $scope.selected_accounts, from: $scope.accounts, filter: $scope.filter_accounts },
      region: { selected: $scope.selected_regions, from: $scope.regions, filter: $scope.filter_regions },
      product: { selected: $scope.selected_products, from: $scope.products, filter: $scope.filter_products },
      operation: { selected: $scope.selected_operations, from: $scope.operations, filter: $scope.filter_operations },
      usageType: { selected: $scope.selected_usageTypes, from: $scope.usageTypes, filter: $scope.filter_usageTypes },
    };
    if ($scope.showResourceGroups) {
      params.resourceGroup = { selected: $scope.selected_resourceGroups, from: $scope.resourceGroups };
    }
    if ($scope.showResourceGroupTags) {
      params.enabledUserTags = $scope.enabledUserTags.join(",");
      var keys = [];
      for (var key in $scope.userTags)
        keys.push($scope.userTags[key].name);
      params.userTags = keys.join(",");
      for (var i = 0; i < $scope.userTags.length; i++) {
        if ($scope.enabledUserTags[i]) {
          params["tag-" + $scope.userTags[i].name] = { selected: $scope.selected_userTagValues[i], from: $scope.userTagValues[i] };
        }
        if ($scope.filter_userTagValues[i])
          params["filter-tag-" + $scope.userTags[i].name] = $scope.filter_userTagValues[i];
      }  
    }

    usage_db.updateUrl($location, params);
  }

  $scope.download = function () {
    usage_db.getData($scope, null, null, true);
  }

  $scope.getData = function () {
    $scope.loading = true;
    usage_db.getData($scope, function (result) {
      var hourlydata = [];
      for (var key in result.data) {
        hourlydata.push({ name: key, data: result.data[key] });
      }
      result.data = hourlydata;
      $scope.legends = [];
      $scope.stats = result.stats;
      highchart.drawGraph(result, $scope);

      $scope.legendName = $scope.groupBy.name;
      $scope.legend_usage_cost = $scope.usage_cost;
    });
  }

  $scope.accountsChanged = function () {
    $scope.updateRegions();
  }

  $scope.regionsChanged = function () {
    $scope.updateProducts();
  }

  $scope.productsChanged = function () {
    if ($scope.showResourceGroups)
      $scope.updateResourceGroups();
    else if ($scope.showResourceGroupTags)
      $scope.updateResourceGroupTags(0);
    else
      $scope.updateOperations();
  }

  $scope.resourceGroupsChanged = function () {
    $scope.updateOperations();
  }

  $scope.operationsChanged = function () {
    $scope.updateUsageTypes();
  }

  $scope.updateUsageTypes = function () {
    usage_db.getUsageTypes($scope, function (data) {
    });
  }

  $scope.updateOperations = function () {
    usage_db.getOperations($scope, function (data) {
      $scope.updateUsageTypes();
    });
  }

  $scope.updateResourceGroups = function () {
    usage_db.getResourceGroups($scope, function (data) {
      $scope.updateOperations();
    });
  }

  $scope.getUserTags = function () {
    usage_db.getUserTags($scope, function (data) {
      $scope.groupByTags = $scope.userTags;
      if ($scope.userTags.length > 0) {
        $scope.groupByTag = $scope.userTags[0];
        if ($scope.enabledUserTags.length != $scope.userTags.length) {
          $scope.enabledUserTags = Array($scope.userTags.length);
          for (var i = 0; i < $scope.userTags.length; i++)
            $scope.enabledUserTags[i] = false;
          }
      }
      $scope.updateRegions();
    });
  }

  $scope.updateResourceGroupTags = function (index) {
    usage_db.getUserTagValues($scope, index, function (data) {
      index++;
      if (index < $scope.userTags.length)
        $scope.updateResourceGroupTags(index)
      else
        $scope.updateOperations();
    });
  }

  $scope.updateProducts = function () {
    usage_db.getProducts($scope, function (data) {
      if ($scope.showResourceGroups)
        $scope.updateResourceGroups();
      else if ($scope.showResourceGroupTags)
        $scope.updateResourceGroupTags(0);
      else
        $scope.updateOperations();
    });
  }

  $scope.updateRegions = function () {
    usage_db.getRegions($scope, function (data) {
      $scope.updateProducts();
    });
  }

  usage_db.getParams($location.hash(), $scope);

  var fn = function () {
    usage_db.getAccounts($scope, function (data) {
      if ($scope.showResourceGroupTags)
        $scope.getUserTags()
      else
        $scope.updateRegions();
    });

    $scope.getData();

    jQuery("#start, #end").datetimepicker({
      showTime: false,
      showMinute: false,
      ampm: true,
      timeFormat: 'hhTT',
      dateFormat: 'yy-mm-dd'
    });
    jQuery('#end').datetimepicker().val($scope.end);
    jQuery('#start').datetimepicker().val($scope.start);
  }

  if ($scope.spans) {
    $http({
      method: "GET",
      url: "getTimeSpan",
      params: { spans: $scope.spans, end: $scope.end, consolidate: $scope.consolidate }
    }).success(function (result) {
      $scope.end = result.end;
      $scope.start = result.start;
      fn();
    });
  }
  else
    fn();
}

function appgroupCtrl($scope, $location, $http, usage_db, highchart) {

  //  var predefinedQuery = {product: "ebs,ec2,ec2_instance,monitor,rds,s3"};
  $scope.showsps = false;
  $scope.factorsps = false;
  $scope.showResourceGroups = true;
  $scope.showAppGroups = true;
  $scope.plotType = "area";
  $scope.legends = [];
  $scope.usage_cost = "cost";
  $scope.usageUnit = "";
  $scope.groupBys = [
    { name: "Account" },
    { name: "Region" },
    { name: "Product" },
    { name: "ResourceGroup" },
    { name: "Operation" },
    { name: "UsageType" }
  ],
    $scope.groupBy = $scope.groupBys[3];
  $scope.consolidate = "hourly";
  $scope.end = new Date();
  $scope.start = new Date();
  var startMonth = $scope.end.getUTCMonth() - 1;
  var startYear = $scope.end.getUTCFullYear();
  if (startMonth < 0) {
    startMonth += 12;
    startYear -= 1;
  }
  $scope.start.setUTCFullYear(startYear);
  $scope.start.setUTCMonth(startMonth);
  $scope.start.setUTCDate(1);
  $scope.start.setUTCHours(0);

  $scope.end = highchart.dateFormat($scope.end); //$filter('date')($scope.end, "y-MM-dd hha");
  $scope.start = highchart.dateFormat($scope.start); //$filter('date')($scope.start, "y-MM-dd hha");

  $scope.updateUrl = function () {
    $scope.end = jQuery('#end').datetimepicker().val();
    $scope.start = jQuery('#start').datetimepicker().val();
    var params = {
      appgroup: $scope.appgroup.name,
      usage_cost: $scope.usage_cost,
      start: $scope.start,
      end: $scope.end,
      groupBy: $scope.groupBy.name,
      consolidate: $scope.consolidate,
      plotType: $scope.plotType,
      showsps: "" + $scope.showsps,
      factorsps: "" + $scope.factorsps,
      account: { selected: $scope.selected_accounts, from: $scope.accounts, filter: $scope.filter_accounts },
      region: { selected: $scope.selected_regions, from: $scope.regions, filter: $scope.filter_regions },
      product: { selected: $scope.selected_products, from: $scope.products, filter: $scope.filter_products },
      operation: { selected: $scope.selected_operations, from: $scope.operations, filter: $scope.filter_operations },
      usageType: { selected: $scope.selected_usageTypes, from: $scope.usageTypes, filter: $scope.filter_usageTypes }
    };
    usage_db.updateUrl($location, params);
  }

  $scope.download = function () {
    usage_db.getData($scope, null, null, true);
  }

  $scope.getData = function () {
    $scope.loading = true;
    usage_db.getData($scope, function (result) {
      var hourlydata = [];
      for (var key in result.data) {
        hourlydata.push({ name: key, data: result.data[key] });
      }
      result.data = hourlydata;
      $scope.legends = [];
      $scope.stats = result.stats;
      highchart.drawGraph(result, $scope);

      $scope.legendName = $scope.groupBy.name;
      $scope.legend_usage_cost = $scope.usage_cost;
    });
  }

  $scope.accountsChanged = function () {
    $scope.updateRegions();
  }

  $scope.regionsChanged = function () {
    $scope.updateProducts();
  }

  $scope.productsChanged = function () {
    $scope.updateOperations();
  }

  $scope.operationsChanged = function () {
    $scope.updateUsageTypes();
  }

  $scope.updateUsageTypes = function () {
    usage_db.getUsageTypes($scope, function (data) {
    });
  }

  $scope.updateOperations = function () {
    usage_db.getOperations($scope, function (data) {
      $scope.updateUsageTypes();
    });
  }

  $scope.updateProducts = function () {
    usage_db.getProducts($scope, function (data) {
      $scope.updateOperations();
    });
  }

  $scope.updateRegions = function () {
    usage_db.getRegions($scope, function (data) {
      $scope.updateProducts();
    });
  }

  usage_db.getParams($location.hash(), $scope);

  $http({
    method: "GET",
    url: "getApplicationGroup",
    params: { name: $scope.appgroup }
  }).success(function (result2) {
    if (result2.status === 200 && result2.data) {
      $scope.appgroup = result2.data;
      $scope.selected_resourceGroups = [];
      var selected = [];
      for (var key in $scope.appgroup.data) {
        for (var i in $scope.appgroup.data[key]) {
          if (selected.indexOf($scope.appgroup.data[key][i].name) >= 0)
            continue;

          selected.push($scope.appgroup.data[key][i].name);
          $scope.selected_resourceGroups.push($scope.appgroup.data[key][i]);
        }
      }

      usage_db.getAccounts($scope, function (data) {
        $scope.updateRegions();
      });

      $scope.getData();
    }
    else {
      alert("Application group " + $scope.appgroup + " does not exist.")
    }
  });

  jQuery("#start, #end").datetimepicker({
    showTime: false,
    showMinute: false,
    ampm: true,
    timeFormat: 'hhTT',
    dateFormat: 'yy-mm-dd'
  });
  jQuery('#end').datetimepicker().val($scope.end);
  jQuery('#start').datetimepicker().val($scope.start);
}

function breakdownCtrl($scope, $location, $http, usage_db, highchart) {

  $scope.showResourceGroups = true;
  $scope.usage_cost = "cost";

  $scope.groupBys = [{ name: "ResourceGroup" }, { name: "ApplicationGroup" }];
  $scope.groupBy = $scope.groupBys[0];
  $scope.consolidate = "daily";
  $scope.end = new Date();
  $scope.end = highchart.dayFormat($scope.end); //$filter('date')($scope.end, "y-MM-dd hha");
  $scope.spans = 4;

  $scope.deleteAppGroup = function (appgroup) {
    var r = confirm("Are you sure to delete application group \"" + appgroup + "\"?");
    if (r) {
      $http({
        method: "GET",
        url: "deleteApplicationGroup",
        params: { name: appgroup }
      }).success(function (result) {
        if (result.status === 200) {
          $scope.message = "Application group " + appgroup + " has been deleted.";
          $scope.getData();
        }
      });
    }
  }

  $scope.updateUrl = function () {
    $scope.end = jQuery('#end').datetimepicker().val();
    var params = {
      usage_cost: $scope.usage_cost,
      end: $scope.end.length > 10 ? $scope.end : $scope.end + " 12AM",
      spans: "" + $scope.spans,
      consolidate: $scope.consolidate,
      groupBy: $scope.groupBy.name,
      showResourceGroups: "" + $scope.showResourceGroups,
      account: { selected: $scope.selected_accounts, from: $scope.accounts, filter: $scope.filter_accounts },
      region: { selected: $scope.selected_regions, from: $scope.regions, filter: $scope.filter_regions },
      product: { selected: $scope.selected_products, from: $scope.products, filter: $scope.filter_products },
      operation: { selected: $scope.selected_operations, from: $scope.operations, filter: $scope.filter_operations },
      usageType: { selected: $scope.selected_usageTypes, from: $scope.usageTypes, filter: $scope.filter_usageTypes }
    };
    usage_db.updateUrl($location, params);
  }

  $scope.order = function (index) {

    if ($scope.predicate != index) {
      $scope.reservse = index === 'name';
      $scope.predicate = index;
    }
    else {
      $scope.reservse = !$scope.reservse;
    }
    var compare = function (a, b) {
      if (a[index] < b[index])
        return !$scope.reservse ? 1 : -1;
      if (a[index] > b[index])
        return !$scope.reservse ? -1 : 1;
      return 0;
    }
    $scope.data.sort(compare);
  }

  $scope.getData = function () {
    $scope.loading = true;
    $scope.dataEnd = $scope.end.length > 10 ? $scope.end : $scope.end + " 12AM";
    usage_db.getData($scope, function (result) {
      $scope.data = [];
      if (result.time && result.time.length > 0)
        $scope.dataStart = highchart.dateFormat(result.time[0]);
      $scope.periods = usage_db.reverse(result.time);
      $scope.hours = usage_db.reverse(result.hours);

      var keys = [];
      for (var key in result.data) {
        keys.push(key);
        var values = {};
        var totals = usage_db.reverse(result.data[key]);
        $scope.headers = [];
        for (var i in totals) {
          values[2 * i] = totals[i];
          values[2 * i + 1] = (totals[i] / $scope.hours[i]);
          $scope.headers.push({ index: 2 * i, name: "total", start: highchart.dateFormat($scope.periods[i]), end: highchart.dateFormat(i == 0 ? new Date().getTime() : $scope.periods[i - 1]) });
          $scope.headers.push({ index: 2 * i + 1, name: "hourly", start: highchart.dateFormat($scope.periods[i]), end: highchart.dateFormat(i == 0 ? new Date().getTime() : $scope.periods[i - 1]) });
        }
        values.name = key;
        $scope.data.push(values);
      }
      $scope.loading = false;
      $scope.legendPrecision = $scope.usage_cost == "cost" ? 2 : 0;
      $scope.legend_usage_cost = $scope.usage_cost;
      $scope.data_consolidate = $scope.consolidate;
    }, { breakdown: true, spans: $scope.spans });

    $scope.legendName = $scope.groupBy.name;
  }

  $scope.accountsChanged = function () {
    $scope.updateRegions();
  }

  $scope.regionsChanged = function () {
    $scope.updateProducts();
  }

  $scope.productsChanged = function () {
    $scope.updateOperations();
  }

  $scope.operationsChanged = function () {
    $scope.updateUsageTypes();
  }

  $scope.updateUsageTypes = function () {
    usage_db.getUsageTypes($scope, function (data) {
    });
  }

  $scope.updateOperations = function () {
    usage_db.getOperations($scope, function (data) {
      $scope.updateUsageTypes();
    });
  }

  $scope.updateProducts = function () {
    usage_db.getProducts($scope, function (data) {
      $scope.updateOperations();
    });
  }

  $scope.updateRegions = function () {
    usage_db.getRegions($scope, function (data) {
      $scope.updateProducts();
    });
  }

  usage_db.getParams($location.hash(), $scope);
  if ($scope.end.length > 10)
    $scope.end = $scope.end.substr(0, 10)

  usage_db.getAccounts($scope, function (data) {
    $scope.updateRegions();
  });

  $scope.getData();

  jQuery("#end").datepicker({
    dateFormat: 'yy-mm-dd'
  });
  jQuery('#end').datepicker().val($scope.end);
}

function summaryCtrl($scope, $location, usage_db, highchart) {

  $scope.usage_cost = "cost";
  $scope.usageUnit = "";
  $scope.groupBys = [
    { name: "Account" },
    { name: "Region" },
    { name: "Product" },
    { name: "Operation" },
    { name: "UsageType" }
  ],
    $scope.groupBy = $scope.groupBys[2];
  $scope.consolidate = "hourly";
  $scope.plotType = "area";
  $scope.end = new Date();
  $scope.start = new Date();
  var startMonth = $scope.end.getUTCMonth() - 6;
  var startYear = $scope.end.getUTCFullYear();
  if (startMonth < 0) {
    startMonth += 12;
    startYear -= 1;
  }
  $scope.start.setUTCFullYear(startYear);
  $scope.start.setUTCMonth(startMonth);

  $scope.end = highchart.dateFormat($scope.end); //$filter('date')($scope.end, "y-MM-dd hha");
  $scope.start = highchart.dateFormat($scope.start); //$filter('date')($scope.start, "y-MM-dd hha");

  $scope.updateUrl = function () {
    usage_db.updateUrl($location, {
      groupBy: $scope.groupBy.name,
      account: { selected: $scope.selected_accounts, from: $scope.accounts, filter: $scope.filter_accounts },
      region: { selected: $scope.selected_regions, from: $scope.regions, filter: $scope.filter_regions },
      product: { selected: $scope.selected_products, from: $scope.products, filter: $scope.filter_products },
      operation: { selected: $scope.selected_operations, from: $scope.operations, filter: $scope.filter_operations },
      usageType: { selected: $scope.selected_usageTypes, from: $scope.usageTypes, filter: $scope.filter_usageTypes }
    });
  }

  $scope.order = function (index) {

    if ($scope.predicate != index) {
      $scope.reservse = index === 'name';
      $scope.predicate = index;
    }
    else {
      $scope.reservse = !$scope.reservse;
    }
    var compareName = function (a, b) {
      if (a[index] < b[index])
        return !$scope.reservse ? 1 : -1;
      if (a[index] > b[index])
        return !$scope.reservse ? -1 : 1;
      return 0;
    }
    var compare = function (a, b) {
      a = $scope.data[a.name];
      b = $scope.data[b.name];
      if (a[index] < b[index])
        return !$scope.reservse ? 1 : -1;
      if (a[index] > b[index])
        return !$scope.reservse ? -1 : 1;
      return 0;
    }
    if (index === 'name')
      $scope.legends.sort(compareName);
    else {
      $scope.legends.sort(compare);
    }
  }

  $scope.getData = function () {
    $scope.loading = true;
    usage_db.getData($scope, function (result) {
      $scope.data = {};
      $scope.monthes = usage_db.reverse(result.time);
      $scope.hours = usage_db.reverse(result.hours);

      var keys = [];
      for (var key in result.data) {
        keys.push(key);
        var values = {};
        var totals = usage_db.reverse(result.data[key]);
        $scope.headers = [];
        for (var i in totals) {
          values[2 * i] = totals[i];
          values[2 * i + 1] = (totals[i] / $scope.hours[i]);
          $scope.headers.push({ index: 2 * i, name: "total", start: highchart.dateFormat($scope.monthes[i]), end: highchart.dateFormat(i == 0 ? new Date().getTime() : $scope.monthes[i - 1]) });
          $scope.headers.push({ index: 2 * i + 1, name: "hourly", start: highchart.dateFormat($scope.monthes[i]), end: highchart.dateFormat(i == 0 ? new Date().getTime() : $scope.monthes[i - 1]) });
        }
        values.name = key;
        $scope.data[key] = (values);
      }
      $scope.resultStart = result.start;

      usage_db.getData($scope, function (result) {
        var hourlydata = [];
        for (var i in keys) {
          if (result.data[keys[i]]) {
            hourlydata.push({ name: keys[i], data: result.data[keys[i]] });
          }
        }
        result.data = hourlydata;
        $scope.legends = [];
        highchart.drawGraph(result, $scope, true);
      }, { consolidate: "hourly", aggregate: "none", breakdown: false });
    }, { consolidate: "monthly", aggregate: "data", breakdown: true });
    $scope.legendName = $scope.groupBy.name;
  }

  $scope.nextGroupBy = function (groupBy) {
    for (var i in $scope.groupBys) {
      if ($scope.groupBys[i].name === groupBy) {
        var j = (parseInt(i) + 1) % $scope.groupBys.length;
        return $scope.groupBys[j].name;
      }
    }
  }

  $scope.accountsChanged = function () {
    $scope.updateRegions();
  }

  $scope.regionsChanged = function () {
    $scope.updateProducts();
  }

  $scope.productsChanged = function () {
    $scope.updateOperations();
  }

  $scope.operationsChanged = function () {
    $scope.updateUsageTypes();
  }

  $scope.updateUsageTypes = function () {
    usage_db.getUsageTypes($scope, function (data) {
    });
  }

  $scope.updateOperations = function () {
    usage_db.getOperations($scope, function (data) {
      $scope.updateUsageTypes();
    });
  }

  $scope.updateProducts = function () {
    usage_db.getProducts($scope, function (data) {
      $scope.updateOperations();
    });
  }

  $scope.updateRegions = function () {
    usage_db.getRegions($scope, function (data) {
      $scope.updateProducts();
    });
  }

  usage_db.getParams($location.hash(), $scope);

  usage_db.getAccounts($scope, function (data) {
    $scope.updateRegions();
  });

  $scope.getData();
}

function editCtrl($scope, $location, $http) {
  $scope.data = [];
  $scope.left = {};
  $scope.right = {};
  $scope.leftfilter = {};
  $scope.rightfilter = {};
  $scope.appgroup = { data: {} };

  var compare = function (a, b) {
    if (a.name < b.name)
      return -1;
    if (a.name > b.name)
      return 1;
    return 0;
  }

  $scope.add = function (row) {
    if ($scope.right[row.name] && $scope.right[row.name].length > 0) {
      if (!$scope.appgroup.data[row.name])
        $scope.appgroup.data[row.name] = []
      $scope.appgroup.data[row.name] = $scope.appgroup.data[row.name].concat($scope.right[row.name]);
      $scope.appgroup.data[row.name].sort(compare);

      for (var i in $scope.right[row.name]) {
        var toremove = $scope.right[row.name][i];
        row.data.splice(row.data.indexOf(toremove), 1);
      }
      $scope.left[row.name] = $scope.right[row.name];
      $scope.right[row.name] = [];
    }
  }

  $scope.remove = function (row) {
    if ($scope.left[row.name] && $scope.left[row.name].length > 0) {
      row.data = row.data.concat($scope.left[row.name]);
      row.data.sort(compare);

      for (var i in $scope.left[row.name]) {
        var toremove = $scope.left[row.name][i];
        $scope.appgroup.data[row.name].splice($scope.appgroup.data[row.name].indexOf(toremove), 1);
      }
      $scope.right[row.name] = $scope.left[row.name];
      $scope.left[row.name] = [];
    }
  }

  var emailRegex = /\S+@\S+\.\S+/;
  $scope.isDisabled = function () {
    var disabled = !$scope.appgroup.name || !emailRegex.test($scope.appgroup.owner) || jQuery.isEmptyObject($scope.appgroup.data);
    if (!disabled) {
      disabled = true;
      for (var key in $scope.appgroup.data) {
        disabled = disabled && $scope.appgroup.data[key].length == 0;
      }
    }

    return disabled;
  }

  $scope.save = function () {
    if ($scope.isDisabled())
      return;

    $scope.loading = true;
    $http({
      method: "POST",
      url: "saveApplicationGroup",
      data: getJsonToSave()
    }).success(function (result) {
      if (result.status === 200) {
        $scope.isCreate = false;
        $scope.message = "Application group " + $scope.appgroup.name + " has been saved.";
        $scope.loading = false;
      }
    });
  }

  var getJsonToSave = function () {
    var result = { data: {} };
    result.name = $scope.appgroup.name;
    result.owner = $scope.appgroup.owner;
    for (var key in $scope.appgroup.data) {
      var selected = [];
      for (var i in $scope.appgroup.data[key])
        selected.push($scope.appgroup.data[key][i].name);
      result.data[key] = selected;
    }
    return result;
  }

  var name = $location.hash();
  if (!name) {
    $scope.isCreate = true;
  }

  $http({
    method: "GET",
    url: "getResourceGroupLists",
    params: {}
  }).success(function (result) {
    if (result.status === 200 && result.data) {
      $scope.data = result.data;
      for (var i in result.data) {
        var row = result.data[i];
        row.name = row.product.name;
        if (row.name === 'Elastic Compute Cloud (EC2)')
          row.displayName = 'Applications';
        else if (row.name === 'Simple Storage Service (S3)')
          row.displayName = 'S3 Buckets';
        else
          row.displayName = row.name;
      }
      if (name) {
        $http({
          method: "GET",
          url: "getApplicationGroup",
          params: { name: name }
        }).success(function (result2) {
          if (result2.status === 200 && result2.data) {
            $scope.appgroup = result2.data;
            for (var key in $scope.appgroup.data) {
              var selected = [];
              for (var i in $scope.appgroup.data[key]) {
                selected.push($scope.appgroup.data[key][i].name);
              }
              var from;
              for (var i in $scope.data) {
                if ($scope.data[i].name === key) {
                  from = $scope.data[i];
                  break;
                }
              }
              for (var i in selected) {
                for (var j in from.data) {
                  if (from.data[j].name === selected[i]) {
                    from.data.splice(j, 1);
                    break;
                  }
                }
              }
            }
          }
          else {
            $scope.isCreate = true;
          }
        });
      }
    }
    else {
      alert("Error querying the server. Please try again later...");
    }
  });
}

