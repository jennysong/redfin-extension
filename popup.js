$(function() {
 
    let unitAddress, assessment, BCAGetByAddress, assessmentLink

    chrome.storage.sync.get(['address', 'bcAssessment'], function(result) {
        unitAddress = result['address'].address
        
        if (!unitAddress) {
            return
        }
        if (result['bcAssessment'] && Array.isArray(result['bcAssessment'])) {
            assessment = result['bcAssessment'].find(assess => assess.origAddress == unitAddress)
            insertInfo(assessment)
        }
        if (!assessment) {
            // alert('sending')
            BCAGetByAddress = 'https://www.bcassessment.ca/Property/Search/GetByAddress?addr=' + encodeURIComponent(unitAddress)
            fetch(BCAGetByAddress)
                .then(response => response.json())
                .then(data => {
                    assessmentLink = 'https://www.bcassessment.ca//Property/Info/' + data[0].value
                    return fetch(assessmentLink) 
                })
                .then(response => response.text())
                .then(data => {
                    const parser = new DOMParser()
                    const bcaDoc = parser.parseFromString(data, 'text/html')
                    if (bcaDoc.getElementById('usage-validation-region')) {
                        window.open(assessmentLink)
                        return
                    }
                    
                    assessment = {
                        ...collectDataFromBCADoc(bcaDoc, propertyIdMap),
                        origAddress: unitAddress,
                        link: assessmentLink
                    }
                    const storedAssessment = result['bcAssessment'] || []
                    chrome.storage.sync.set({'bcAssessment': storedAssessment.concat(assessment)})
                    insertInfo(assessment)
                })             
        }
    })

    let collectDataFromBCADoc = (doc, map) => {
        let output = {}
        if (doc) {
            Object.keys(map).forEach(key => {
                switch(typeof(map[key])) {
                    case "string":
                        let targetElement = doc.getElementById(map[key])
                        if (targetElement)
                            output[key] = targetElement.textContent
                        else {
                            console.warn(`cannot find element by id: ${map[key]}`)
                            output[key] = null
                        }
                        break;
                    case "object":
                        output[key] = collectDataFromBCADoc(doc, map[key])
                        break;
                    default:
                        console.warn(`unexpected type: ${typeof(map[key])}`)
                }
            })
        }
        return output
    }
    
    const propertyIdMap = {
        address: "mainaddresstitle",
        latest: {
            totalValue: "lblTotalAssessedValue",
            landValue: "lblTotalAssessedLand",
            buildingValue: "lblTotalAssessedBuilding"
        },
        previous: {
            totalValue: "lblPreviousAssessedValue",
            landValue: "lblPreviousAssessedLand",
            buildingValue: "lblPreviousAssessedBuilding"
        },
        extraInformation: {
            yearBuilt: "lblYearBuilt",
            description: "lblDescription",
            bedrooms: "lblBedrooms",
            bathrooms: "lblBathRooms",
            carports: "lblCarPorts",
            garages: "lblGarages",
            landSize: "lblLandSize",
            firstFloorArea: "lblFirstFloorArea",
            secondFloorArea: "lblSecondFloorArea",
            basementFinishArea: "lblBasementFinishArea",
            strataArea: "lblStrataTotalArea",
            buildingStoreys: "lblStoriesBuilding",
            numberOfApartmentUnits: "lblNumberUnitApartment",
        }
    }
    
    const extraInformationLabels = {
        address: "Address",
        yearBuilt: "Year Built",
        description: "Description",
        landSize: "Land Size",
        strataArea: "Strata sqft",
        numberOfApartmentUnits: "No.of Units",
        firstFloorArea: "1st Floor sqft",
        secondFloorArea: "2nd Floor sqft",
        basementFinishArea: "Basement sqft",
        buildingStoreys: "Storeys",
        bedrooms: "Bedrooms",
        bathrooms: "Bathrooms",
        carports: "Carports",
        garages: "Garages",
    }

    const convertToInt = (string) => {
        return parseInt(string.replace(/[^0-9.]/g, ''))
    }
    
    const getChanges = (current, previous) => {
        if (!current || !previous) {
            return null
        }
        
        let style, prefix
        const value = convertToInt(current) / convertToInt(previous) * 100 - 100
        
        if (value === 0) {
            return null
        }
        
        if (value > 0) {
            style = 'positive',
            prefix = '+'
        } else if (value < 0) {
            style = 'negative'
            prefix = ''
        } 
        return { style, value: `${prefix}${value.toFixed(1)}%` }
    }
    

    const insertInfo = (assessment) => {
        if (assessment) {
            $('body').removeClass('loading')
            
            let hasDetailedValuation = false
            const { latest, previous, extraInformation, origAddress, link } = assessment
            const totalChanges = getChanges(latest.totalValue, previous.totalValue)
            const landChanges = getChanges(latest.landValue, previous.landValue)
            const buildingChanges = getChanges(latest.buildingValue, previous.buildingValue)
            
            $('.total.valuation .value').text(latest.totalValue)
            $('.total.valuation .previous-value .amount').text(previous.totalValue)
            
            if (totalChanges) {
                $('.total.valuation .changes')
                    .addClass(totalChanges.style)
                    .text(totalChanges.value)
            }
            
            if(latest.landValue) {
                $('.land.valuation .value').text(latest.landValue)    
                $('.land.valuation .previous-value .amount').text(previous.landValue)
                hasDetailedValuation = true
                
                if (landChanges) {
                    $('.land.valuation .changes')
                        .addClass(landChanges.style)
                        .text(landChanges.value)
                }
            } else {
                $('.land.valuation').addClass('unknown')
            }
            
            if(latest.buildingValue) {
                $('.building.valuation .value').text(latest.buildingValue)
                $('.building.valuation .previous-value .amount').text(previous.buildingValue)
                hasDetailedValuation = true
                
                if (buildingChanges) {
                    $('.building.valuation .changes')
                        .addClass(buildingChanges.style)
                        .text(buildingChanges.value)
                }
            } else {
                $('.building.valuation').addClass('unknown')
            }
            
            if (hasDetailedValuation) {
                $('.valuations').addClass('has-detailed-valuation')
            }
            
            if(origAddress) {
                $('.original-address.value').text(origAddress)
            }

            const $extraItemList = $(".extra-item-list")
            _(extraInformationLabels).each((label, key) => {
                const extraValue = s(extraInformation[key]).trim().value()
                if (extraValue) {
                    const $extraItem = $("<div class='extra-item'>")
                    $extraItem.append($("<div class='label'>").text(label))
                    $extraItem.append($("<div class='value'>").text(extraValue))
                    $extraItemList.append($extraItem)
                }
            })
            
            $('.view-on-bc-assessment.btn').click(function() {
                chrome.tabs.create({url: link})
            })
        }
    }  
})
