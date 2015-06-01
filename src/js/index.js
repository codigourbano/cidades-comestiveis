window.angular = require('angular');
window._ = require('underscore');

window.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

require('angular-ui-router');
require('angular-resource');
require('angular-cookies');
require('angular-leaflet-directive');
require('ng-dialog');

var app = angular.module('cc', [
	'ngDialog',
	'ngCookies',
	'ui.router', 
	'ngResource',
	'leaflet-directive'
]);

app.config([
	'$stateProvider',
	'$urlRouterProvider',
	'$locationProvider',
	'$httpProvider',
	function($stateProvider, $urlRouterProvider, $locationProvider, $httpProvider) {

		$locationProvider.html5Mode({
			enabled: true,
			requireBase: false
		});
		$locationProvider.hashPrefix('!');

		$stateProvider
			.state('home', {
				url: '/',
				controller: 'HomeCtrl',
				templateUrl: function() {
					if(!isMobile) {
						return '/views/home.html';
					} else {
						return '/views/mobile/home.html';
					}
				}
			})
			.state('home.area', {
				url: 'area/:id/',
				controller: 'SingleCtrl',
				resolve: {
					Data: [
						'$stateParams',
						'CCService',
						function($stateParams, CC) {
							return CC.area.get({id: $stateParams.id}).$promise;
						}
					],
					Type: function() {
						return 'area';
					}
				}
			})
			.state('home.newItem', {
				url: 'new/',
				controller: 'ItemCtrl'
			})
			.state('home.editItem', {
				url: 'edit/:type/:id/',
				controller: 'EditItemCtrl'
			})
			.state('projeto', {
				url: '/projeto/',
				controller: 'PageCtrl',
				templateUrl: '/views/projeto.html'
			})
			.state('manifesto', {
				url: '/manifesto/',
				controller: 'PageCtrl',
				templateUrl: '/views/manifesto.html'
			});

		/*
		 * Trailing slash rule
		 */
		$urlRouterProvider.rule(function($injector, $location) {
			var path = $location.path(),
				search = $location.search(),
				params;

			// check to see if the path already ends in '/'
			if (path[path.length - 1] === '/') {
				return;
			}

			// If there was no search string / query params, return with a `/`
			if (Object.keys(search).length === 0) {
				return path + '/';
			}

			// Otherwise build the search string and return a `/?` prefix
			params = [];
			angular.forEach(search, function(v, k){
				params.push(k + '=' + v);
			});
			
			return path + '/?' + params.join('&');
		});
	}
])
.run([
	'$rootScope',
	'$location',
	'$window',
	function($rootScope, $location, $window) {
		/*
		 * Analytics
		 */
		$rootScope.$on('$stateChangeSuccess', function(ev, toState, toParams, fromState, fromParams) {
			if($window._gaq && fromState.name) {
				$window._gaq.push(['_trackPageview', $location.path()]);
			}
			if(fromState.name) {
				document.body.scrollTop = document.documentElement.scrollTop = 0;
			}
		});
	}
]);

require('./service');
require('./auth');
require('./filters');

app.controller('MainCtrl', [
	'CCAuth',
	'CCLoginDialog',
	'ngDialog',
	'$rootScope',
	'$scope',
	'$timeout',
	function(Auth, CCLoginDialog, ngDialog, $rootScope, $scope, $timeout) {

		$scope.$watch(function() {
			return Auth.getToken();
		}, function(res) {
			$scope.user = res || false;
		});

		$scope.loginDialog = CCLoginDialog;

		$scope = angular.extend($scope, Auth);

		$scope.mapActive = false;

		$scope.initMap = function() {
			$scope.mapActive = true;
			$rootScope.$broadcast('map.activated');
		};
	}
]);

app.controller('HomeCtrl', [
	'$rootScope',
	'$scope',
	'CCService',
	function($rootScope, $scope, CC) {

		CC.area.query(function(data) {
			$scope.areas = data.areas;
			_.each($scope.areas, function(area) {
				area.dataType = 'area';
			});
		});

	}
]);

app.controller('MapCtrl', [
	'$scope',
	'$state',
	'leafletData',
	function($scope, $state, leaflet) {

		angular.extend($scope, {
			defaults: {
				// tileLayer: "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
				tileLayer: "http://otile1.mqcdn.com/tiles/1.0.0/map/{z}/{x}/{y}.jpg",
				maxZoom: 18,
				scrollWheelZoom: false
			},
			center: {
				lat: -23.550520,
				lng: -46.633309,
				zoom: 12
			}
		});
		leaflet.getMap('map').then(function(map) {
			setTimeout(function() {
				map.invalidateSize(true);
			}, 250);
			$scope.$on('map.activated', function() {
				setTimeout(function() {
					map.invalidateSize(true);
				}, 250);
			});
			$scope.$on('leafletDirectiveMarker.mouseover', function(event, args) {
				args.leafletEvent.target.openPopup();
				args.leafletEvent.target.setZIndexOffset(1000);
			});

			$scope.$on('leafletDirectiveMarker.mouseout', function(event, args) {
				args.leafletEvent.target.closePopup();
				args.leafletEvent.target.setZIndexOffset(0);
			});

			$scope.$on('leafletDirectiveMarker.click', function(event, args) {
				// console.log(args);
				$state.go('home.' + args.model.object.dataType, { type: args.model.object.dataType, id:  args.model.object._id });
			});
		});

	}
]);

app.controller('SingleCtrl', [
	'Data',
	'Type',
	'CCAuth',
	'ngDialog',
	'$scope',
	'$state',
	function(Data, Type, Auth, ngDialog, $scope, $state) {

		$scope.item = Data;
		$scope.type = Type;

		var user = Auth.getToken();

		$scope.canEdit = false;
		if(user) {
			if(user._id == Data.creator._id || user.role == 'admin') {
				$scope.canEdit = true;
			}
		}

		var dialog = ngDialog.open({
			template: '/views/' + Type + '.html',
			scope: $scope,
			preCloseCallback: function() {
				$state.go('home');
			}
		});
	}
]);

app.controller('EditItemCtrl', [
	'$scope',
	'$state',
	'$stateParams',
	'CCService',
	'CCAuth',
	'CCLoginDialog',
	'CCItemEdit',
	function($scope, $state, $stateParams, CC, Auth, LoginDialog, ItemEdit) {

		$scope.editDialog = ItemEdit;

		var edit = function() {
			CC[$stateParams.type].get({id: $stateParams.id}, function(item) {
				ItemEdit(item, $stateParams.type);
			});
		};

		$scope.$watch($state.current.name, function() {
			if($state.current.name == 'home.editItem') {
				if(Auth.getToken()) {
					edit();
				} else {
					LoginDialog(edit);
				}
			}
		});
	}
]);

app.controller('ItemCtrl', [
	'$scope',
	'CCItemEdit',
	function($scope, ItemEdit) {

		$scope.editDialog = ItemEdit;

	}
]);

app.controller('DashboardCtrl', [
	'$scope',
	'CCService',
	'CCItemEdit',
	'CCAuth',
	function($scope, CC, ItemEdit, Auth) {

		$scope.$watch(function() {
			return Auth.getToken();
		}, function(user) {
			$scope.items = false;
			$scope.user = user;
			CC.user.getContributions({id: $scope.user._id}, function(data) {
				$scope.items = data.contributions;
			});
		});

	}
]);

app.controller('UserCtrl', [
	'$scope',
	'ngDialog',
	function($scope, ngDialog) {

		var dialog;

		$scope.editUserDialog = function() {
			dialog = ngDialog.open({
				template: '/views/edit-profile.html',
				controller: ['$scope', 'CCAuth', 'CCService', 'leafletData', function($scope, Auth, CC, leafletData) {

					$scope.user = angular.extend({}, Auth.getToken());

					$scope.map = {
						defaults: {
							// tileLayer: "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
							tileLayer: "http://otile1.mqcdn.com/tiles/1.0.0/map/{z}/{x}/{y}.jpg",
							maxZoom: 18,
							scrollWheelZoom: false
						},
						center: {
							lat: -23.550520,
							lng: -46.633309,
							zoom: 12
						}
					}

					if($scope.user.location && $scope.user.location.coordinates.length) {
						$scope.map.center = {
							lat: $scope.user.location.coordinates[0],
							lng: $scope.user.location.coordinates[1],
							zoom: 18
						};
					}

					$scope.geolocation = navigator.geolocation;

					leafletData.getMap('user-location').then(function(map) {
						$scope.locate = function() {
							if($scope.geolocation) {
								$scope.geolocation.getCurrentPosition(function(pos) {
									$scope.user.location = {
										type: 'Point',
										coordinates: [pos.coords.latitude, pos.coords.longitude]
									};
									map.setView([pos.coords.latitude, pos.coords.longitude], 18);
								});
							}
						}
						$scope.$on('leafletDirectiveMap.dragend', function() {
							var coords = map.getCenter();
							$scope.user.location = {
								type: 'Point',
								coordinates: [coords.lat, coords.lng]
							};
						});
					});

					$scope.save = function(user) {
						delete user.email;
						CC.user.update(user, function(data) {
							Auth.setToken(angular.extend(Auth.getToken(), data));
							dialog.close();
						});
					}

				}]
			});
		}

	}
]);

app.controller('PageCtrl', [
	'$scope',
	function($scope) {

		

	}
]);

angular.element(document).ready(function() {
	angular.bootstrap(document, ['cc']);
});