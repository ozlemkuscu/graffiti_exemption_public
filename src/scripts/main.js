//This is the starting point for the application.
const app = new cot_app("Graffiti Exemption");
const configURL = "//www1.toronto.ca/static_files/WebApps/CommonComponents/graffiti_exemption/JSONFeed.js";

// example
// "https://map.toronto.ca/geoservices/rest/search/rankedsearch?searchString=55%20john%20street&searchArea=1&matchType=1&projectionType=1&retRowLimit=10"

let form, config, httpHost;
let mailSend;
//let upload_selector = 'admin_dropzone';

const form_id = "graffiti_exemption";
let docDropzone;
let imageDropzone;
let cookie_SID = form_id + ".sid";
let repo = "graffiti_exemption";

$(document).ready(function () {
  app.render(function () {
    initialize();
  }
  );
  function renderApp() {
    httpHost = detectHost();
    loadForm();
    app.setBreadcrumb(app.data['breadcrumbtrail']);
    app.addForm(form, 'top');
    docDropzone = new Dropzone("div#document_dropzone", $.extend(config.admin.docDropzonePublic, {
      "dz_id": "document_dropzone", "fid": "", "form_id": form_id,
      "url": config.api_public.upload + config.default_repo + '/' + config.default_repo,
    }));
    imageDropzone = new Dropzone("div#image_dropzone", $.extend(config.admin.imageDropzonePublic, {
      "init": function () {
        let fieldname = "txtPicName";
        this
          .on("addedfile", function (file) { validateUpload("addedfile", fieldname, file.name); })
          .on("success", function (file) { validateUpload("success", fieldname, file.name); })
          .on("removedfile", function () { validateUpload("removedFile", fieldname, ""); })
          .on("error", function () { validateUpload("error", fieldname, ""); });
      },
      "dz_id": "image_dropzone", "fid": "", "form_id": form_id,
      "url": config.api_public.upload + config.default_repo + '/' + config.default_repo,
    }));
    initForm();
  }
  function initialize() {
    loadVariables();
  }
  function loadVariables() {
    $.ajax({
      url: configURL,
      type: "GET",
      cache: "true",
      dataType: "jsonp",
      jsonpCallback: "callback",
      success: function (data) {
        $.each(data.items, function (i, item) { app.data[item.title] = item.summary; });
        config = app.data.config;
        renderApp();
      },
      error: function () {
        alert("Error: The application was unable to load data.")
      }
    })
  }
  function loadForm() {
    form = new CotForm({
      id: form_id,
      title: app.data["Form Title"],
      useBinding: false,
      rootPath: config.httpHost.rootPath_public[httpHost],
      sections: getSubmissionSections(),
      success: function () {
      }
    });
  }
  function detectHost() {
    switch (window.location.origin) {
      case config.httpHost.root_public.dev:
        return 'dev';
      case config.httpHost.root_public.qa:
        return 'qa';
      case config.httpHost.root_public.prod:
        return 'prod';
      default:
        console.log("Cannot find the server parameter in detectHost function. Please check with your administrator.");
        return 'dev';
    }
  }
});
function initForm() {
  mailSend= config.messages.notify.sendNotification;
  var dataCreated = new Date();
  dataCreated = moment(dataCreated).format(config.dateTimeFormat);
  $("#recCreated").val(dataCreated);
  $("#lsteStatus").val("New");
  $("#closebtn").click(function () { window.close(); });
  $("#printbtn").click(function () { window.print(); });
  $("#setbtn").click(function () {
    $("#emAddress").val($("#eAddress").val());
    $("#emCity").val($("#eCity").val());
    $("#emPostalCode").val($("#ePostalCode").val());
    $("#emPrimaryPhone").val($("#ePrimaryPhone").val());
  });
  $("#savebtn").click(function () {
    let form_fv = $('#' + form_id).data('formValidation');
    form_fv.validate();
    if (form_fv.isValid()) { submitForm() }
  });
  $('#eNotice').on('change', function () { $('#' + form_id).formValidation('revalidateField', $('#ComplianceDate')); });
  $('#eMaintenance').on('change', function () { $('#' + form_id).formValidation('revalidateField', $('#eMaintenanceAgreement')); });
  $(".dz-hidden-input").attr("aria-hidden", "true");
  $(".dz-hidden-input").attr("aria-label", "File Upload Control");

  $('#' + form_id).data('formValidation')
    .addField('txtPicName', { excluded: false, validators: { notEmpty: { message: app.data["imageValidation"] } } })
}
function submitForm() {

  setGeoParams();

  let payload = form.getData();
  payload.doc_uploads = processUploads(docDropzone, config.default_repo, false);
  payload.image_uploads = processUploads(imageDropzone, config.default_repo, false);

  $.ajax({
    url: config.httpHost.app_public[httpHost] + config.api_public.post + config.default_repo + '?sid=' + getCookie(cookie_SID),
    type: 'POST',
    data: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json; charset=utf-8;',
      'Cache-Control': 'no-cache'
    },
    dataType: 'json',
    success: function (data) {
      if ((data.EventMessageResponse.Response.StatusCode) == 200) {
        $('#app-content-top').html(config.messages.submit.done);
        //    $('#app-content-bottom').html(app.data["Success Message"]);
        // notify code section
        if (mailSend) {
          // Email report notice to configured staff
          emailNotice(data.EventMessageResponse.Event.EventID, 'notify');
        }
      }
    },
    error: function () {
      $('#successFailArea').html(config.messages.submit.fail);
    }
  }).done(function (data, textStatus, jqXHR) {
    //  if (data && data.EventMessageResponse && data.EventMessageResponse.Event && data.EventMessageResponse.Event.EventID) { }
  });
}
function emailNotice(fid, action) {
  let emailTo = {};
  let emailCaptain = config.captain_emails;
  let emailAdmin = config.admin_emails;
  (typeof emailCaptain !== 'undefined' && emailCaptain != "") ? $.extend(emailTo, emailCaptain) : "";
  (typeof emailAdmin !== 'undefined' && emailAdmin != "") ? $.extend(emailTo, emailAdmin) : "";

  var emailRecipients = $.map(emailTo, function (email) {
    return email;
  }).filter(function (itm, i, a) {
    return i === a.indexOf(itm);
  }).join(',');

  var payload = JSON.stringify({
    'emailTo': emailRecipients,
    'emailFrom': (config.messages.notify.emailFrom ? config.messages.notify.emailFrom : 'wmDev@toronto.ca'),
    'id': fid,
    'status': action,
    'body': (config.messages.notify.emailBody ? config.messages.notify.emailBody : 'New submission has been received.'),
    'emailSubject': (config.messages.notify.emailSubject ? config.messages.notify.emailSubject : 'New submission')
  });

  $.ajax({
    url: config.httpHost.app[httpHost] + config.api.email,
    type: 'POST',
    data: payload,
    headers: {
      'Content-Type': 'application/json; charset=utf-8;',
      'Cache-Control': 'no-cache'
    },
    dataType: 'json'
  }).done(function (data, textStatus, jqXHR) {
    if (action === 'notify') {
      hasher.setHash(fid + '?alert=success&msg=notify.done&ts=' + new Date().getTime());
    }
  }).fail(function (jqXHR, textStatus, error) {
    console.log("POST Request Failed: " + textStatus + ", " + error);
    if (action === 'notify') {
      hasher.setHash(fid + '?alert=danger&msg=notify.fail&ts=' + new Date().getTime());
    }
  });
}
function processUploads(DZ, repo, sync) {
  let uploadFiles = DZ.existingUploads ? DZ.existingUploads : new Array;
  let _files = DZ.getFilesWithStatus(Dropzone.SUCCESS);
  let syncFiles = sync;
  if (_files.length == 0) {
    //empty
  } else {
    $.each(_files, function (i, row) {
      let json = JSON.parse(row.xhr.response);
      json.name = row.name;
      json.type = row.type;
      json.size = row.size;
      json.bin_id = json.BIN_ID[0];
      delete json.BIN_ID;
      uploadFiles.push(json);
      syncFiles ? '' : '';
    });
  }
  return uploadFiles;
}
function validateUpload(event, field, value) {
  //placeholder for additional logic based on the event
  switch (event) {
    case "addedfile":
      break;
    case "success":
      break;
    case "removedfile":
      break;
    case "error":
      console.log("custom error code")
      $('#' + form_id).data('formValidation').updateMessage(field, 'notEmpty', app.data.uploadServerErrorMessage)
      break;
    default:
  }
  $('#' + field).val(value);
  $('#' + form_id).data('formValidation').revalidateField(field);
}
function getSubmissionSections() {
  let section = [
    {
      id: "contactSec",
      title: app.data["Contact Details Section"],
      className: "panel-info",
      rows: [
        {
          fields: [
            { "id": "eFirstName", "title": app.data["First Name"], "className": "col-xs-12 col-md-6", "required": true },
            { "id": "eLastName", "title": app.data["Last Name"], "className": "col-xs-12 col-md-6", "required": true },
            {
              "id": "eAddress", "title": app.data["Address"], "className": "col-xs-12 col-md-6",
              //  "required": true
            },
            { "id": "eCity", "title": app.data["City"], "value": "Toronto", "className": "col-xs-12 col-md-6" }
          ]
        },
        {
          fields: [{ "id": "ePostalCode", "title": app.data["Postal Code"], "className": "col-xs-12 col-md-6" },
          {
            "id": "ePrimaryPhone", "title": app.data["Phone"], "validationtype": "Phone", "className": "col-xs-12 col-md-6"
            //  "required": true
          },
          { "id": "eFax", "title": app.data["Fax"], "validationtype": "Phone", "className": "col-xs-12 col-md-6" },
          { "id": "eEmail", "title": app.data["Email"], "validationtype": "Email", "validators": { regexp: { regexp: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/, message: 'This field must be a valid email. (###@###.####)' } }, "className": "col-xs-12 col-md-6" }
          ]
        }
      ]
    },
    {
      id: "graffitiSec",
      title: app.data["Graffiti Section"],
      className: "panel-info",
      rows: [
        {
          fields: [
            {
              "id": "emSameAddress", "title": "", type: "html",
              html: `<div className="col-xs-12 col-md-12"><button class="btn btn-info" id="setbtn"><span class="" aria-hidden="true"></span> ` + app.data["Same As Above"] + `</button></div>`
            }
          ]
        },
        {
          fields: [
            {
              "id": "emAddress", "title": app.data["Address"], "className": "col-xs-12 col-md-6"
              //  "required": true
            },
            { "id": "emCity", "title": app.data["City"], "value": "Toronto", "className": "col-xs-12 col-md-6" }
          ]
        },
        {
          fields: [{ "id": "emPostalCode", "title": app.data["Postal Code"], "className": "col-xs-12 col-md-6" },
          { "id": "emPrimaryPhone", "title": app.data["Phone"], "validationtype": "Phone", "className": "col-xs-12 col-md-6" },
          {
            "id": "emFacingStreet", "title": app.data["Facing Street"], "className": "col-xs-12 col-md-6"
            //  "required": true, 
          },
          {
            "id": "emDescriptiveLocation", "posthelptext": app.data["DescriptiveLocationText"], "title": app.data["graffitiDesLocation"], "className": "col-xs-12 col-md-6",
            "required": true,
          }
          ]
        }
      ]
    },
    {
      id: "detailsSec",
      title: app.data["Details Section"],
      className: "panel-info",
      rows: [
        {
          fields: [
            {
              "id": "ePermission", "title": app.data["permission"], "type": "radio", "className": "col-xs-12 col-md-6", "choices": config.choices.yesNoFull, "orientation": "horizontal",
              //    "required":true, 
              "validators": {
                callback: {
                  message: app.data["permissionValidation"],
                  callback: function (value, validator, $field) {
                    return ($field[0].checked);
                  }
                }
              }
            }]
        },
        {
          fields: [
            {
              "id": "eNotice", "title": app.data["notice"], "type": "dropdown", "value": "No", "className": "col-xs-12 col-md-6", "choices": config.choices.yesNoFull, "orientation": "horizontal",
              //  "required": true,
              "validators": {
                callback: {
                  message: app.data["noticeValidation"],
                  callback: function (value, validator, $field) {
                    return ((value == "") ? false : true);
                  }
                }
              }
            }, {
              "id": "ComplianceDate", "title": app.data["compliance"], "type": "datetimepicker", "placeholder": config.dateFormat, "className": "col-xs-12 col-md-6", "options": { format: config.dateFormat },
              "validators": {
                callback: {
                  message: app.data["complianceValidation"],
                  // this is added to formValidation
                  callback: function (value, validator, $field) {
                    var checkVal = $("#eNotice").val();
                    return ((checkVal !== "Yes") ? true : (value !== ''));
                  }
                }
              }
            }, {
              "id": "eMaintenance", "title": app.data["maintenance"], "type": "dropdown", "value": "No", "className": "col-xs-12 col-md-6", "choices": config.choices.yesNoFull, "orientation": "horizontal",
              //  "type": "radio",
              "validators": {
                callback: {
                  message: app.data["maintenanceValidation"],
                  callback: function (value, validator, $field) {
                    return ((value == "") ? false : true);
                  }
                }
              }
            },
            {
              "id": "eMaintenanceAgreement", "title": app.data["agreementDetails"], "className": "col-xs-12 col-md-12",
              "validators": {
                callback: {
                  message: app.data["agreementDetailsValidation"],
                  // this is added to formValidation
                  callback: function (value, validator, $field) {
                    var checkVal = $("#eMaintenance").val();
                    return ((checkVal !== "Yes") ? true : (value !== ''));
                  }
                }
              }
            },
            {
              "id": "eArtistInfo", "title": app.data["artistDetails"], "className": "col-xs-12 col-md-12",
              //  "required":true,
              "validators": {
                callback: {
                  message: app.data["artistDetailsValidation"],
                  callback: function (value, validator, $field) {
                    return ((value == "") ? false : true);
                  }
                }
              }
            },
            {
              "id": "eArtSurfaceEnhance", "title": app.data["enhance"], "className": "col-xs-12 col-md-12",
              //  "required":true,
              "validators": {
                callback: {
                  message: app.data["enhanceValidation"],
                  callback: function (value, validator, $field) {
                    return ((value == "") ? false : true);
                  }
                }
              }
            },
            {
              "id": "eArtLocalCharacter", "title": app.data["adhere"], "className": "col-xs-12 col-md-12",
              //  "required":true,
              "validators": {
                callback: {
                  message: app.data["adhereValidation"],
                  callback: function (value, validator, $field) {
                    return ((value == "") ? false : true);
                  }
                }
              }
            },
            { "id": "eAdditionalComments", "title": app.data["comments"], "className": "col-xs-12 col-md-12" },
          ]
        }]
    },
    {
      id: "attSec",
      title: app.data["Attachments Section"],
      className: "panel-info",
      rows: [
        {
          fields: [
            { "id": "AttachmentText", "title": "", "type": "html", "html": app.data["AttachmentText"], "className": "col-xs-12 col-md-12" },
            {
              "id": "Images", "prehelptext": app.data["ImagesText"], "title": app.data["Images"], "type": "html", "aria-label": "Dropzone File Upload Control Field for Images",
              "html": '<section aria-label="File Upload Control Field for Images" id="attachment"><div class="dropzone" id="image_dropzone" aria-label="Dropzone File Upload Control for Images Section"></div></section><input type="hidden" name="txtPicName" id="txtPicName" value="" /><section id="image_uploads"></section>', "className": "col-xs-12 col-md-12"
            },
            {
              "id": "Documents", "prehelptext": app.data["DocumentsText"], "title": app.data["Documents"], "type": "html", "aria-label": "Dropzone File Upload Control Field for Documents",
              "html": '<section aria-label="File Upload Control Field for Documents" id="attachment"><div class="dropzone" id="document_dropzone" aria-label="Dropzone File Upload Control for Document Section"></div></section><section id="doc_uploads"></section>', "className": "col-xs-12 col-md-12"
            },
            { "id": "DeclarationText", "title": "", "type": "html", "html": app.data["DeclarationText"], "className": "col-xs-12 col-md-12" },
            {
              "id": "actionBar",
              "type": "html",
              "html": `<div className="col-xs-12 col-md-12"><button class="btn btn-success" id="savebtn"><span class="glyphicon glyphicon-send" aria-hidden="true"></span> ` + config.button.submitReport + `</button>
                 <button class="btn btn-success" id="printbtn"><span class="glyphicon glyphicon-print" aria-hidden="true"></span>Print</button></div>`
            },
            {
              "id": "successFailRow",
              "type": "html",
              "className": "col-xs-12 col-md-12",
              "html": `<div id="successFailArea" className="col-xs-12 col-md-12"></div>`
            },
            { "id": "fid", "type": "html", "html": "<input type=\"text\" id=\"fid\" aria-label=\"Document ID\" aria-hidden=\"true\" name=\"fid\">", "class": "hidden" },
            { "id": "action", "type": "html", "html": "<input type=\"text\" id=\"action\" aria-label=\"Action\" aria-hidden=\"true\" name=\"action\">", "class": "hidden" },
            { "id": "createdBy", "type": "html", "html": "<input type=\"text\" id=\"createdBy\" aria-label=\"Complaint Created By\" aria-hidden=\"true\" name=\"createdBy\">", "class": "hidden" },
            { "id": "recCreated", "type": "html", "html": "<input type=\"text\" id=\"recCreated\" aria-label=\"Record Creation Date\" aria-hidden=\"true\" name=\"recCreated\">", "class": "hidden" },
            { "id": "lsteStatus", "type": "html", "html": "<input type=\"hidden\" aria-label=\"Status\" aria-hidden=\"true\" value=\"New\" id=\"lsteStatus\" name=\"lsteStatus\">", "class": "hidden" },
            { "id": "AddressGeoID", "type": "html", "html": "<input type=\"hidden\" aria-label=\"Address Geo ID\" aria-hidden=\"true\" id=\"AddressGeoID\" name=\"AddressGeoID\">", "class": "hidden" },
            { "id": "AddressLongitude", "type": "html", "html": "<input type=\"hidden\" aria-label=\"Address Longitude\" aria-hidden=\"true\" id=\"AddressLongitude\" name=\"AddressLongitude\">", "class": "hidden" },
            { "id": "AddressLatitude", "type": "html", "html": "<input type=\"hidden\" aria-label=\"Address Latitude\" aria-hidden=\"true\" id=\"AddressLatitude\" name=\"AddressLatitude\">", "class": "hidden" },
            { "id": "MapAddress", "type": "html", "html": "<input type=\"hidden\" aria-label=\"Map Address\" aria-hidden=\"true\" id=\"MapAddress\" name=\"MapAddress\">", "class": "hidden" },
            { "id": "ShowMap", "type": "html", "html": "<input type=\"hidden\" aria-label=\"Show Map\" aria-hidden=\"true\" id=\"ShowMap\" name=\"ShowMap\">", "class": "hidden" }
          ]
        }
      ]
    }
  ]
  return section;
}
function getAdminSectionsBottom() {
  let section = [
    {
      id: "hiddenSec",
      title: "",
      className: "panel-info",
      rows: [{ fields: [] }]
    }]
  return section;
}
function setGeoParams() {
  let queryStr = "?searchString=" + encodeURIComponent($("#emAddress").val() + " " + $("#emCity").val() + " " + $("#emPostalCode").val());
  $.ajax({
    url: config.geoURL + queryStr + config.geoParam, // geoURL,
    type: "GET",
    cache: "true",
    dataType: "json",
    async: false,
    success: function (data) {
      let resultLoc = data.result.bestResult;
      if (resultLoc.length > 0) {
        $("#AddressGeoID").val(resultLoc[0]["geoId"]);
        $("#AddressLongitude").val(resultLoc[0]["longitude"]);
        $("#AddressLatitude").val(resultLoc[0]["latitude"]);
      } else {
        $("#AddressGeoID").val("");
        $("#AddressLongitude").val("");
        $("#AddressLatitude").val("");
      }
    },
    error: function () {
      $("#AddressGeoID").val("");
      $("#AddressLongitude").val("");
      $("#AddressLatitude").val("");
    }
  })
}
CotForm.prototype.getData = function () {
  var data = {}, blanks = {}, rowIndexMap = {}; // {stringIndex: intIndex}
  $.each($('#' + this.cotForm.id).serializeArray(), function (i, o) {
    if (o.name.indexOf('row[') !== -1) {
      var sRowIndex = o.name.substring(o.name.indexOf('[') + 1, o.name.indexOf(']'));
      if (sRowIndex !== 'template') {
        var rows = data['rows'] || [];
        var iRowIndex = rowIndexMap[sRowIndex];
        if (iRowIndex === undefined) {
          rows.push({});
          iRowIndex = rows.length - 1;
          rowIndexMap[sRowIndex] = iRowIndex;
        }
        rows[iRowIndex][o.name.split('.')[1]] = o.value;
        data['rows'] = rows;
      }
    } else {
      if (data.hasOwnProperty(o.name)) {
        data[o.name] = $.makeArray(data[o.name]);
        data[o.name].push(o.value);
      } else {
        data[o.name] = o.value;
      }
    }
  });

  var _blanks = $('#' + this.cotForm.id + ' [name]')
  $.each(_blanks, function () {
    if (!data.hasOwnProperty(this.name)) {
      blanks[this.name] = '';
    }
  });
  return $.extend(data, blanks);
};


