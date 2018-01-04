'use strict';
/*
User-created 'requirement' module to represent degree requirements.

Implemented via classes (JS Objects) representing different types of requirements:
- 'Takes': base class; satisfied if a certain course has been taken
- 'And': extension of 'Takes'; satisfied if ALL of its components have been taken
- 'Or': extension of 'Takes'; satisfied if ANY of its components have been taken

*/

var requirement_dict;
var taken;

function checkFulfilledCourses(requirement_dict, taken) {
    var requirement = makeRequirement(requirement_dict);
    var fulfilled = requirement.isSatisfied(taken);
    return(fulfilled);
}

// Recursive function to return a (possibly nested) requirement class object based
// on a (possibly nested) dict or branch thereof.
function makeRequirement(branch) {
    for (var key in branch) { // There should only be one key per dictionary/branch
        var val = branch[key];

        // Base case: if key is 'Takes', then just return 'Takes' requirement object
        if (key === 'Takes') {
            return Takes(val);

        // Otherwise, recurse!
        } else {

            // Get list of requirement objects from recursion upon this branch
            var requirement_list = [];

            for (var i = 0; i < val.length; i++) {
                var data = val[i];
                var req = makeRequirement(data);
                requirement_list.push(req);
            };

            // Then determine what type of requirement, and return
            if (key === 'And') {
                return And(requirement_list);
            } else if (key === 'Or') {
                return Or(requirement_list);
            } else {
                throw "Error: Unexpected key not in ('Takes','And','Or')";
            }
        }
    }
}



// ------------- JS Objects (as classes) ------------- //

function Takes(val) {
    return {
        type: 'simple',
        requirements: val,
        course: val,
        isSatisfied: function(sched) {
            return (sched.indexOf(this.course) != -1);
        }
    };
}

function And(requirements) {
    return {
        type: 'and',
        requirements: requirements,
        isSatisfied: function(sched) {
            return requirements.every(function(requirement) {
                return requirement.isSatisfied(sched);
            });
        }
    }
}

function Or(requirements) {
    return {
        type: 'or',
        requirements: requirements,
        isSatisfied: function(sched) {
            return requirements.some(function(requirement) {
                return requirement.isSatisfied(sched);
            });
        }
    }
}

module.exports = {
  checkFulfilledCourses,
  makeRequirement,
  Takes,
  And,
  Or
};
