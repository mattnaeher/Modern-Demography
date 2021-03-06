//Load in data
var worldData = d3.json('../data/world-110.json').then(function(world) { return world; })
var ageData = d3.csv('../data/age.csv').then(function(ages) { return ages; })


var width = 1200,
    height = 675,
    projScale = origprojScale = height / 2.1,
    translation = [width / 2, height / 2],
    projScaleChange,
    prevTransformScale = 1,
    rotation,
    colorToCountry = [],
    selected = false;

var formatPer = d3.format('.2f');
function stripString(string) { return string.replace(/[^a-z0-9]/gi,"").toLowerCase(); }


// Initiate main canvas and conext
var canvas = d3.select('#canvas-container').append('canvas')
    .attr('id', 'canvas-globe')
    .attr('width', width)
    .attr('height', height);

var context = canvas.node().getContext('2d');

// Initiate hidden canvas with context
var hiddenCanvas = d3.select('#canvas-container').append('canvas')
    .attr('id', 'canvas-hidden')
    .attr('width', width)
    .attr('height', height);

var hiddenContext = hiddenCanvas.node().getContext('2d');

//Buffer canvas
var bufferCanvas = document.createElement('canvas');
var bufferContext = bufferCanvas.getContext('2d');

bufferContext.canvas.width = width;
bufferContext.canvas.height = height;


// Orthographic projection
var projection = d3.geoOrthographic()
    .scale(projScale)
    .translate(translation)
    .clipAngle(90);

// Projection for hidden canvas
var hiddenProjection = d3.geoEquirectangular()
    .translate([width / 2, height / 2])
    .scale(width / 7);

// Generate paths
var bufferPath = d3.geoPath()
    .projection(projection)
    .context(bufferContext);

var hiddenPath = d3.geoPath()
    .projection(hiddenProjection)
    .context(hiddenContext);

// Visual helpers and utilities
var sphere = { type: 'Sphere' },
    grid = d3.geoGraticule()();

//PuBu color scale
var puBu = d3.scaleSequential(d3.interpolatePuBu).domain([0,30]);


//Fuctions to draw
function drawScene(countries, countryIndex) {

  // Clear
  bufferContext.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);

  // Sphere fill
  bufferContext.beginPath();
  bufferPath(sphere);
  bufferContext.fillStyle = 'aliceblue';
  bufferContext.fill();

  // Grid
  bufferContext.beginPath();
  bufferPath(grid);
  bufferContext.lineWidth = 0.5;
  bufferContext.strokeStyle = '#D9EAEF';
  bufferContext.stroke();

  // Individual Country fill
  countries.features.forEach(function(el) {

    bufferContext.beginPath();
    bufferPath(el);
    bufferContext.fillStyle = el.properties.age_color;
    bufferContext.fill();

  });

  // Stroke for individual country
  bufferContext.beginPath();
  bufferPath(countries);
  bufferContext.lineWidth = 0.5;
  bufferContext.strokeStyle = '#fff';
  bufferContext.stroke();

  // Stroke for country hovered over
  if (countryIndex >= 0) {

    bufferContext.beginPath();
    bufferContext.setLineDash([4,2]);
    bufferPath(countries.features[countryIndex]);
    bufferContext.lineWidth = 1;
    bufferContext.strokeStyle = 'darkgreen';
    bufferContext.stroke();
    bufferContext.setLineDash([]);

  }

}


function renderScene(world, countryIndex){

  // Draw scene
  drawScene(world, countryIndex);

  // Clear canvas
  context.clearRect(0, 0, width, height);

  // Render scene
  context.drawImage(bufferCanvas, 0, 0, bufferCanvas.width, bufferCanvas.height);

}


function drawHiddenCanvas(world) {

  var countries = world.features;
  countries.forEach(function(el, i) {

    colorToCountry[i] = countries[i].properties;

    hiddenContext.beginPath();
    hiddenPath(el);
    hiddenContext.fillStyle = 'rgb(' + i + ',0,0)';
    hiddenContext.fill();

  });

}


//Main drawing function
function ready(world, ages) {

  /* Prep data */

  // The world
  var countries = topojson.feature(world, world.objects.ne_110m_admin_0_countries); // Convert TopoJSON to GeoJSON array of countries

  // Reduce country to admin name
  countries.features = countries.features.map(function(el) {

    return {
      geometry: el.geometry,
      type: el.type,
      properties: {
        admin: el.properties.admin,
        adm0_a3: el.properties.adm0_a3,
        pop_est: el.properties.pop_est
      }
    };

  });

  // Sort
  countries.features.sort(function(a, b) {
    return d3.ascending(a.properties.admin, b.properties.admin);
  });

  console.log('countries', countries);
  console.log('ages', ages);

  insertageDataBinary();

  function insertageDataLinear() {

    ages.forEach(function(el) {

      countries.features.forEach(function(elem) {

        if (el.country === elem.properties.admin) {
          elem.properties.age_area = +el.area;
          elem.properties.age_percent = +el.percent;
        }

      });

    });

  }

  function insertageDataBinary() {

    var bisectName = d3.bisector(function(d) { return d.properties.admin; }).right;

    for (var i = 0; i < ages.length; i++) {

      // Get the index of the found element
      var indexBisect = bisectName(countries.features, ages[i].country);
      var indexMatch = indexBisect - 1;

      // Add the relevant information
      countries.features[indexMatch].properties.age_area = +ages[i].area;
      countries.features[indexMatch].properties.age_percent = +ages[i].percent;
      countries.features[indexMatch].properties.age_color = puBu(+ages[i].percent);

    }

  }


  // Draw world
  requestAnimationFrame(function() {
    renderScene(countries, selected);
    drawHiddenCanvas(countries);
  });


  /* Make map interactive*/

  var deltaMove = (function() {

    var prevX = 0,
        prevY = 0;

    function getDeltas(event) {

      var movementX = prevX ? event.screenX - prevX : 0;
      var movementY = prevY ? event.screenY - prevY : 0;

      prevX = event.screenX;
      prevY = event.screenY;

      return {
        x: movementX,
        y: movementY
      }

    }

    function resetDeltas() {
      prevX = 0;
      prevY = 0;
    }

    return {
      coords: getDeltas,
      reset: resetDeltas
    }

  })();

  //Zoom & pan
  var zoom = d3.zoom()
    .scaleExtent([0.5, 4])
    .on("zoom", zoomed)
    .on('end', deltaMove.reset);

  canvas.call(zoom);

  function zoomed() {

    var delta = deltaMove.coords(d3.event.sourceEvent);

    // get the deltas
    var dx = delta.x;
    var dy = delta.y;


    // This will return either 'mousemove' or 'wheel'
    var event = d3.event.sourceEvent.type;

    if (event === 'wheel') {

      // Change the scale according to the user interaction
      var transformScale = d3.event.transform.k;
      projScaleChange = (transformScale - prevTransformScale) * origprojScale;
      projScale = projScale + projScaleChange;
      projection.scale(projScale);
      prevTransformScale = transformScale;

    } else if (event === 'mousemove') { // if the user pans

      // Change the rotation according to the user interaction
      var r = projection.rotate();
      rotation = [r[0] + dx * 0.4, r[1] - dy * 0.5, r[2]];
      projection.rotate(rotation);

    } else {

      console.warn('invalid mouse event in zoomed()');

    }

    // Rerender
    requestAnimationFrame(function() {
      renderScene(countries, selected);
    });

    hideTooltip();

  }



  /* Tooltip*/

  var svg, yScale;
  buildTooltip(ages);

  //Act on mouseover
  canvas.on('mousemove', highlightPicking);


  function highlightPicking() {

    var pos = d3.mouse(this);
    var longlat = projection.invert(pos);
    var hiddenPos = hiddenProjection(longlat);

    var pickedColor = hiddenContext.getImageData(hiddenPos[0], hiddenPos[1], 1, 1).data;

    var inGlobe =
      Math.abs(pos[0] - projection(projection.invert(pos))[0]) < 0.5 &&
      Math.abs(pos[1] - projection(projection.invert(pos))[1]) < 0.5;

    selected = inGlobe && pickedColor[3] === 255 ? pickedColor[0] : false;

    requestAnimationFrame(function() {
      renderScene(countries, selected);
    });

    var country = countries.features[selected];
    if (selected !== false) showTooltip(pos, country);
    if (selected === false) hideTooltip();
  }

  function isAgeData(data) {
    return (data != 0);
  }

  function buildTooltip(data) {

      //Prep data
      var agesByPercent = data
        .slice()
        .sort(function(a, b) {
          return d3.descending(+a.percent, +b.percent);
        })
        .map(function(el) {
          return {
            country: el.country,
            percent: +el.percent,
            color: puBu(+el.percent)
          };
        });

      var countryList = agesByPercent.map(function(el) {
        return el.country;
      });


      //Make bar chart
      var tipWidth = 200,
          tipHeight = 200;

      var xScale = d3.scaleLinear().domain([0, 30]).range([0, tipWidth]);
      yScale = d3.scaleBand().domain(countryList).rangeRound([0, tipHeight]);

      svg = d3.select('svg#tip-visual').attr('width', tipWidth).attr('height', tipHeight);

      svg.selectAll('.bar')
          .data(agesByPercent)
        .enter().append('rect')
          .attr('class', 'bar')
          .attr('id', function(d) { return stripString(d.country); })
          .attr('x', xScale(0))
          .attr('y', function(d) { return yScale(d.country); })
          .attr('width', function(d) { return xScale(d.percent); })
          .attr('height', yScale.bandwidth())
          .attr('fill', function(d) { return d.color; });



  }

  // initialise queue array to check for new build
  var countryQueue = [undefined, undefined];

  function showTooltip(mouse, element) {

    // Get country data
    var countryProps = element.properties;

    // Create queue to check when to build new tooltip
    countryQueue.unshift(countryProps.admin);
    countryQueue.pop();

    // Build and move tooltip
    if (countryQueue[0] !== countryQueue[1]) {


      // Build tooltip header
      var headHtml =
        'Percent 65+ (2016): ' + formatPer(countryProps.age_percent) + '%' +
        '<br>Percent 65+ (1980): ' + formatPer(countryProps.age_area) + '%';

      d3.select('#tip-header h1').html(countryProps.admin);
      d3.select('#tip-header div').html(headHtml);

      // Highlight bar in tip-visual
      svg.selectAll('.bar')
        .attr('fill', function(d) { return d.color; })
        .attr('height', yScale.bandwidth());
      d3.select('#' + stripString(countryProps.admin))
        .attr('fill', 'orange')
        .attr('height', yScale.bandwidth()*3)
        .raise();

      // Show and move tooltip
      d3.select('#tooltip')
        .style('left', (mouse[0] + 20) + 'px')
        .style('top', (mouse[1] + 20) + 'px')
        .transition().duration(100)
        .style('opacity', 0.98);

    } else {

      // Move tooltip
      d3.select('#tooltip')
        .style('left', (mouse[0] + 20) + 'px')
        .style('top', (mouse[1] + 20) + 'px');

    }

  }

  function hideTooltip() {

    countryQueue.unshift(undefined);
    countryQueue.pop();

    d3.select('#tooltip')
      .transition().duration(100)
      .style('opacity', 0);

  }


}

Promise.all([worldData, ageData]).then(function(response) {

  var worldResolved = response[0];
  var agesResolved = response[1];

  ready(worldResolved, agesResolved);

});
