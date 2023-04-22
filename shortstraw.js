const eucledianDistance = (p1, p2) => Math.sqrt(p1.map((p1val,i)=>(p1val-p2[i])**2).reduce((sum,current)=>sum+current,0));

const vectorDotProduct = (v1,v2) => v1.map((v1val,i)=>v1val*v2[i]).reduce((sum,current)=>sum+current,0);

const clip = (number,min,max) => Math.min(Math.max(number,min),max)

const mean = (array) => array.length > 0 ? array.reduce((sum,current) => sum+current,0)/array.length : undefined;

//   Angle between two vectors 
const angle = (v1,v2) => {
    const [v1Length,v2Length] = [eucledianDistance(v1,[0,0]),eucledianDistance(v2,[0,0])];
    if (v1Length === 0 || v2Length === 0) return 0
    const rel = vectorDotProduct(v1,v2)/(v1Length*v2Length);
    return Math.acos(clip(rel,-1,1)) 
}

const resampleData = (XOrg,YOrg,scale) => {
    // Make deep copy of X,Y arrays
    const X = [...XOrg];
    const Y = [...YOrg]; 
    // Bouding box coordinates
    const [minX,maxX,minY,maxY] = [Math.min(...X),Math.max(...X),Math.min(...Y),Math.max(...Y)];
    // Length of bbox diagonal
    const dia = eucledianDistance([minX,minY],[maxX,maxY])
    // Scale diagonal to get interspacing distance S
    const S = Math.max(dia/scale,2.5);
    // Initialise distance holder and increment i
    let D = 0
    let i = 0
    let length = X.length;
    const [resampledX,resampledY] = [[X[0]],[Y[0]]];
    while (i < length) {
        const d = eucledianDistance([X[i - 1], Y[i - 1]], [X[i], Y[i]]);
        if (D + d >= S) {
            const qx = X[i - 1] + ((S - D) / d) * (X[i] - X[i - 1]);
            const qy = Y[i - 1] + ((S - D) / d) * (Y[i] - Y[i - 1]);
            resampledX.push(qx);
            resampledY.push(qy);
            X.splice(i,0,qx);
            Y.splice(i,0,qy);
            length = X.length;
            D = 0;
        }
        else {
            D += D;
        }
        i += 1;
    }
    return [resampledX,resampledY]
}  

// Create new corner about halfway through
const halfwayCorner = (straws, a, b) => {
    const quarter = (b - a)/4;
    const [lower,upper] = [Math.ceil(a+quarter),Math.ceil(b-quarter)];
    let minValue = 1000000;
    let minIndex = undefined;
    for (let i=lower; i<upper; i++) {
        if (straws[i]) {
            minValue = straws[i];
            minIndex = i;
        }
    }
    return minIndex
}

// Check if path between two points is a line

const isLine = (X,Y,a,b,t) => {
    const d = eucledianDistance([X[a],Y[a]],[X[b],Y[b]]);
    const allDs = [];
    for (let i=a+1;i<=b;i++) {
        allDs.push(eucledianDistance([X[i-1], Y[i-1]], [X[i], Y[i]]));
    }
    const summedDs = allDs.reduce((sum,current) => sum+current,0);
    return d/summedDs > t ? true : false
}

// Check if corner is actually a curve
const isCurve = (X,Y,c,shift) => {
    // Calculate longer corner points
    const [a,b] = [c-shift,c+shift];
    // Calculate shorter corner points
    const [d,e] = [Math.ceil(c-(c-a)/3),Math.ceil(c+(b-c)/3)];
    // Calculate the long vertices 
    const [lv1,lv2] = [
        [X[c]-X[a],Y[c]-Y[a]],
        [X[c]-X[b],Y[c]-Y[b]],
    ];
    // Calculate the short vertices 
    const [sv1, sv2] = [
      [X[c] - X[d], Y[c] - Y[d]],
      [X[c] - X[e], Y[c] - Y[e]],
    ];
    // Calculate angle between vertices 
    const [alpha,beta] = [angle(lv1,lv2),angle(sv1,sv2)];

    // Dynamic threshold depending on alpha
    const ta = Math.PI * (10 + 800/(alpha/Math.PI * 180 + 35))/180

    return beta - alpha > ta ? alpha : false
}

const getShift = (c,a,b) => clip(Math.min(c-a, b-c), 2, 15)

const angleType = (X,Y,c,shift) => {
    // Calculate longer corner points
    const [a,b] = [c-shift,c+shift];

    // Calculate vertices 
    const [v1, v2] = [
      [X[c] - X[a], Y[c] - Y[a]],
      [X[c] - X[b], Y[c] - Y[b]],
    ];

    const alpha = angle(v1,v2)

    if (alpha < 0.9*0.5*Math.PI) return ["acute",alpha]
    else if (alpha <= 1.1*0.5*Math.PI) return ["right",alpha]
    else if (alpha < 0.99*Math.PI) return ["obtuse",alpha]
    else return ["straight",alpha]
}

const postProcessCorners = (X,Y,corners,straws,t1,t2max,t2min) => {
    let proceed = false;
    while (!proceed) {
        proceed = true
        let length = corners.length
        let i = 1
        while (i<length) {
            const [c1,c2] = [corners[i-1],corners[i]]
            if (!isLine(X,Y,c1,c2, 0.96)) {
                const newCorner = halfwayCorner(straws,c1,c2);
                corners.splice(i,0,newCorner);
                length = corners.length;
                proceed = false
            }
            i += 1
        }
    }
    let length = corners.length - 1;

    [1,2].forEach((run) => {
        let i = 1;
        while (i<length) {
            const [c1,c2] = [corners[i-1],corners[i+1]];
            const t = run === 1 ? t1 : (c2-c1) > 10 ? t2max : t2min;
            if (isLine(X,Y,c1,c2,t)) {
                corners.splice(i,1);
                length = corners.length - 1;
                i -= 1;
            }
            i += 1;
        }
    })

    // Check for consecutive corners and only keep the ones with the shorter straw
    length = corners.length - 1;
    let i = 1
    while (i<length) {
        const [c1,c2] = [corners[i-1],corners[i]];
        if (c1+1 === c2) {
            if (straws[c1]<straws[c2]) {
                const index = corners.indexOf(c1);
                corners.splice(index,1)
            }
            else {
                const index = corners.indexOf(c2);
                corners.splice(index,1);
            }
            length = corners.length = 1
            i -= 1;
        }
        i += 1;
    }
    // Check for endpoint as well but always delete point next to endpoint 
    if (corners[corners.length-1] === corners[corners.length-2] + 1) corners.splice(corners[corners.length-2],1);

    // Check if corner is actually a curve
    const curves = [];
    length = corners.length - 1;
    i = 1;
    let narrowCurved, wideCurved, straight, obtuse, right, acute;
    narrowCurved = wideCurved = straight = obtuse = right = acute = 0;
    const [rawAngles,rawCurves] = [[],[]];
    while (i<length) {
        let [a,c,b] = [corners[i-1],corners[i],corners[i+1]];
        const shift = getShift(c, a, b);
        const arc = isCurve(X,Y,c,shift)
        if (arc) {
            rawCurves.push(arc);
            const index = corners.indexOf(c);
            corners.splice(index,i);
            curves.push(c);
            length = corners.length = 1;
            i -= 1;
            if (arc < 1.7553288301331578) narrowCurved += 1
            else wideCurved +=1 
        }
        else {
            const [aType,aRaw] = angleType(X,Y,c,shift);
            rawAngles.push(aRaw);
            switch (aType) {
                case "straight":
                    straight+=1;
                    break;
                case "obtuse":
                    obtuse+=1;
                    break;
                case "right":
                    right+=1;
                    break;
                case "acute":
                    acute+=1;
                    break;
                default:
                    console.log("Could not match any angle type");
            }
        }
        i += 1
    }

    // If there are only two poins (end and start) it is a straight line
    if (corners.length === 2 && curves.length === 0) {
        const w = Math.min(eucledianDistance([X[0],Y[0]],[X[X.length-1],Y[Y.length-1]]),15);
        straight = 1
    }

    return [corners, curves, [straight, narrowCurved, wideCurved, obtuse, right, acute],[rawAngles,rawCurves]]
}

const computeCorners = (X,Y,t1,t2max,t2min) => {
    const W = 3; // Number of points of each side of straw middle 
    const N = X.length; // Number of points 
    const corners = [0];
    const straws = [];

    if (N > 2*W) {
        // Add straw length for the first point
        straws.push(eucledianDistance([X[0],Y[0]],[X[1+W],Y[1+W]])*((2*W/(W+1))))

        for (let i=1;i<W;i++) {
            // Add straw length for the points close to the beginning
            straws.push(
              eucledianDistance([X[0], Y[0]], [X[i + W], Y[i + W]]) *
                ((2 * W) / (W + 1))
            );
        }
        for (let i=W; i<N-W; i++) {
            straws.push(eucledianDistance([X[i-W], Y[i-W]],[X[i+W],Y[i+W]]))
        }
        for (let i=N-W; i<N-1; i++) {
            straws.push(
                eucledianDistance([X[N-1], Y[N-1]], [X[i - W], Y[i - W]]) * 
                ((2*W)/(W+N-i-1))
            );
        }
        const t = mean(straws) * 0.95;
        let i = W;
        while (i < N-W) {
            if (straws[i] < t) {
                let localMin = 100000000;
                let localMinIndex = i;

                while (i < straws.length && straws[i] < t) {
                    if (straws[i] < localMin) {
                        localMin = straws[i];
                        localMinIndex = i;
                    }
                    i += 1
                }
                corners.push(localMinIndex);
            }
            i += 1
        }

    }
    else { // If N is smaller or equal to W just fill every straw with the same length
        const d = eucledianDistance([X[0],Y[0]],[X[X.length-1],Y[Y.length-1]]);
        for (let i=0;i<N;i++) {
            straws.push(d);
        }
    }

    // Add endpoint to corners
    corners.push(N-1);
    // If data was resampled to have just a point rather than a line
    if (corners[0] === corners[corners.length-1]) {
        corners.splice(corners.length-1,1);
        return [corners,[],[0,0,0,0,0,0],[[],[]]]
    }
    else {
        return postProcessCorners(X,Y,corners,straws,t1,t2max,t2min)
    }
}

// Main routine
const shortstrawMain = (X,Y,t1,t2max,t2min) => {
    const resampled = resampleData(X,Y,80);
    const [corners, curves, analysis, raw] = computeCorners(resampled[0], resampled[1], t1, t2max, t2min);
    return [corners, curves, analysis, resampled, raw]
}

// Parse sketch data
const shortstraw = (paths, t1=0.96, t2max=0.95, t2min=0.944) => {
    const [allCorners, allCurves, resampledData, allRawAngles, allRawCurves] = [[],[],[],[],[]];
    let nos,nocn,nocw,noo,nor,noa;
    nos = nocn = nocw = noo = nor = noa = 0;

    

    // Iterate through all paths in sketch and append results to "global" variables
    paths.forEach((path)=> {
        // console.log(path);
        // Only consider paths that have at least 2 points
        if (path.x.length>1) {
            const data = shortstrawMain(path.x,path.y,t1,t2max,t2min);
            allCorners.push(data[0]);
            allCurves.push(data[1]);
            nos += data[2][0];
            nocn += data[2][1];
            nocw += data[2][2];
            noo += data[2][3];
            nor += data[2][4];
            noa += data[2][5];
            resampledData.push(data[3]);
            allRawAngles.push(...data[4][0]);
            allRawCurves.push(...data[4][1]);
        }
    })
    const featureInfo = {
      straight: nos,
      narrow_curve: nocn,
      wide_curve: nocw,
      obtuse: noo,
      right: nor,
      acute: noa,
    };
    return [allCorners,allCurves,featureInfo,resampledData,allRawAngles,allRawCurves]
}

export default shortstraw;